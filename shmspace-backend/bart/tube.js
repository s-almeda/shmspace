const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { getCache } = require('./fetcher');

const router = express.Router();

const PERSIST_FILE = path.join(__dirname, '.tube_slots.json');

// Tube transit window: a train is considered "in the tube" when its arrival
// at the exit stop is between 0 and 7 minutes away.
//   SB in tube → arriving at Embarcadero (emb_sb) within 7 min
//   NB in tube → arriving at West Oakland (wo_nb)  within 7 min
const TUBE_WINDOW = 7;

function minsUntil(isoTime, now) {
  return (new Date(isoTime) - now) / 60000;
}

const LINE_COLORS = { Yellow: '#ffd700', Blue: '#4a9eff', Red: '#ff4444', Green: '#44ff88', Orange: '#ff8c00' };
function lineColor(line) { return LINE_COLORS[line.split('-')[0]] || '#888888'; }
function trainKey(t)     { return t.vehicleRef ? String(t.vehicleRef) : (t.line + '|' + t.dest); }

// Returns all trains currently in the tube (both directions combined).
function getInTube(cache, now = new Date()) {
  const inTube = [];
  for (const t of [...cache.emb_sb, ...cache.wo_nb]) {
    const m = minsUntil(t.arrives, now);
    if (m >= 0 && m <= TUBE_WINDOW)
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
      const free = [0, 1, 2].find(i => !usedIdxs.includes(i));
      if (free !== undefined) {
        tubeAssignments.set(key, { idx: free, assignedAt: Date.now() });
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

  // Entering: trains arriving at entry stop within 15 min (about to enter tube)
  for (const [stop, station] of [[cache.wo_sb, 'West Oakland'], [cache.emb_nb, 'Embarcadero']]) {
    for (const t of stop) {
      const m = minsUntil(t.arrives, now);
      if (m >= 0 && m <= 15)
        events.push({ status: 'entering', line: t.line, dest: t.dest, vehicleRef: t.vehicleRef || null, color: lineColor(t.line), minutes: Math.round(m), station });
    }
  }

  res.json({ events, fetchedAt: cache.fetchedAt, testMode: cache.testMode || false });
});

module.exports = router;
