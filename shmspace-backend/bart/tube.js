const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { getCache } = require('./fetcher');

const router = express.Router();

const PERSIST_FILE = path.join(__dirname, '.tube_slots.json');

// Tube transit window: a train is considered "in the tube" when its arrival
// at the exit stop is between 0 and N minutes away.
//   SB in tube → arriving at Embarcadero (emb_sb) within TUBE_TRAVEL_MINS (~4:40)
//   NB in tube → arriving at West Oakland (wo_nb)  within TUBE_WINDOW (7 min)
//
// For SB trains, 511 reports West Oakland *arrival* time. The train then dwells
// ~1 min and travels ~1:15 to the tube entrance (WO_SB_OFFSET_MINS total).
// Tube travel SF↔Oakland is ~4:40. So emb_sb arrival ≈ WO arrival + 6:55.
// Using TUBE_WINDOW=7 would detect the train while it's still at WO station;
// using TUBE_TRAVEL_MINS ensures we only fire once it's actually in the tube.
const TUBE_WINDOW       = 7;
const TUBE_TRAVEL_MINS   = 4 + 40 / 60;  // ~4:40 — one-way travel time through tube
const WO_SB_OFFSET_MINS  = 2 + 15 / 60;  // ~2:15 — WO dwell + surface transit to tube entrance (SB)
const WO_NB_EXIT_MINS    = 2;             // ~2:00 — NB train exits tube this many mins before WO arrival

function minsUntil(isoTime, now) {
  return (new Date(isoTime) - now) / 60000;
}

const LINE_COLORS = { Yellow: '#ffd700', Blue: '#4a9eff', Red: '#ff4444', Green: '#44ff88', Orange: '#ff8c00' };
function lineColor(line) { return LINE_COLORS[line.split('-')[0]] || '#888888'; }
function trainKey(t)     { return t.vehicleRef ? String(t.vehicleRef) : (t.line + '|' + t.dest); }

// Returns all trains currently in the tube (both directions combined).
function getInTube(cache, now = new Date()) {
  const inTube = [];
  // SB: exit at Embarcadero. Use tube travel time so we don't fire while the
  // train is still sitting at West Oakland station above ground.
  for (const t of cache.emb_sb) {
    const m = minsUntil(t.arrives, now);
    if (m >= 0 && m <= TUBE_TRAVEL_MINS)
      inTube.push({ line: t.line, dest: t.dest, vehicleRef: t.vehicleRef || null, minutesUntil: Math.round(m) });
  }
  // NB: exit at West Oakland. Train surfaces ~2 min before WO arrival, so use
  // WO_NB_EXIT_MINS as a lower bound to avoid marking it in-tube after it exits.
  for (const t of cache.wo_nb) {
    const m = minsUntil(t.arrives, now);
    if (m >= WO_NB_EXIT_MINS && m <= TUBE_WINDOW)
      inTube.push({ line: t.line, dest: t.dest, vehicleRef: t.vehicleRef || null, minutesUntil: Math.round(m) });
  }
  return inTube;
}

// Maps trainKey → { idx, assignedAt }. Persisted to disk so server restarts
// don't cause slot reshuffling and re-firing on the ESP32s.
const tubeAssignments = new Map();

// Trains that have already been assigned a slot this transit — never assign again.
// Cleared when the train exits the tube.
const playedTrains = new Set();

// Round-robin cursor so tube assignments distribute across all 3 slots
let nextSlot = 0;

try {
  const saved = JSON.parse(fs.readFileSync(PERSIST_FILE, 'utf8'));
  for (const [k, v] of Object.entries(saved)) tubeAssignments.set(k, v);
  console.log('[tube] loaded', tubeAssignments.size, 'slot assignments from disk');
} catch (_) {}

function persistAssignments() {
  fs.writeFileSync(PERSIST_FILE, JSON.stringify(Object.fromEntries(tubeAssignments)));
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get('/cache', (_req, res) => {
  res.json(getCache());
});

router.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'tube.html'));
});

// The only data endpoint. Returns a 3-slot array:
//   tubes[0..2] — null, or the train assigned to that slot.
//
// ESP32 logic (same code on all 3, only TUBE_NUM differs):
//   prevKey = ""
//   on each poll:
//     t = response.tubes[TUBE_NUM]
//     k = t ? (t.vehicleRef || t.line+t.dest) : ""
//     if k != "" && k != prevKey → lightUp(t.color, 3000ms)
//     prevKey = k
router.get('/tube_arrivals', (_req, res) => {
  const cache = getCache();
  const allInTube = getInTube(cache);

  // Drop assignments and played-marks for trains that left the tube
  const active = new Set(allInTube.map(trainKey));
  for (const k of tubeAssignments.keys())
    if (!active.has(k)) tubeAssignments.delete(k);
  for (const k of playedTrains)
    if (!active.has(k)) playedTrains.delete(k);

  // Assign new unplayed trains to slots; evict oldest if all 3 full.
  // playedTrains prevents evicted trains from recapturing a slot and re-firing.
  const tubes = [null, null, null];
  let changed = false;
  for (const t of allInTube) {
    const key = trainKey(t);
    if (!tubeAssignments.has(key) && !playedTrains.has(key)) {
      const usedIdxs = [...tubeAssignments.values()].map(v => v.idx);
      const offset = [0, 1, 2].find(j => !usedIdxs.includes((nextSlot + j) % 3));
      if (offset !== undefined) {
        const idx = (nextSlot + offset) % 3;
        nextSlot = (idx + 1) % 3;
        tubeAssignments.set(key, { idx, assignedAt: Date.now() });
      } else {
        // All slots occupied — evict the oldest to make room
        let oldestKey = null, oldestTime = Infinity;
        for (const [k, v] of tubeAssignments)
          if (v.assignedAt < oldestTime) { oldestTime = v.assignedAt; oldestKey = k; }
        const evictedIdx = tubeAssignments.get(oldestKey).idx;
        tubeAssignments.delete(oldestKey);
        tubeAssignments.set(key, { idx: evictedIdx, assignedAt: Date.now() });
      }
      playedTrains.add(key);
      changed = true;
    }
    const entry = tubeAssignments.get(key);
    if (entry !== undefined)
      tubes[entry.idx] = { line: t.line, dest: t.dest, vehicleRef: t.vehicleRef || null, color: lineColor(t.line), minutesUntil: t.minutesUntil };
  }

  if (changed) persistAssignments();

  res.json({ tubes, fetchedAt: cache.fetchedAt, testMode: cache.testMode || false });
});

router.get('/events', (_req, res) => {
  const cache = getCache();
  const now = new Date();
  const events = [];

  // In tube: trains arriving at exit stop within 7 min
  for (const [stop, station] of [[cache.emb_sb, 'Embarcadero'], [cache.wo_nb, 'West Oakland']]) {
    for (const t of stop) {
      const m = minsUntil(t.arrives, now);
      if (m >= 0 && m <= TUBE_WINDOW)
        events.push({ status: 'in_tube', line: t.line, dest: t.dest, vehicleRef: t.vehicleRef || null, color: lineColor(t.line), minutes: Math.round(m), station });
    }
  }

  // Entering: trains about to enter the tube.
  // SB: 511 reports WO *arrival* time; add offset to get actual tube entry time.
  for (const t of cache.wo_sb) {
    const m = minsUntil(t.arrives, now) + WO_SB_OFFSET_MINS;
    if (m >= 0 && m <= 15)
      events.push({ status: 'entering', line: t.line, dest: t.dest, vehicleRef: t.vehicleRef || null, color: lineColor(t.line), minutes: Math.round(m), station: 'West Oakland' });
  }
  // NB: no offset adjustment reported for this direction.
  for (const t of cache.emb_nb) {
    const m = minsUntil(t.arrives, now);
    if (m >= 0 && m <= 15)
      events.push({ status: 'entering', line: t.line, dest: t.dest, vehicleRef: t.vehicleRef || null, color: lineColor(t.line), minutes: Math.round(m), station: 'Embarcadero' });
  }

  res.json({ events, fetchedAt: cache.fetchedAt, testMode: cache.testMode || false });
});

module.exports = router;
