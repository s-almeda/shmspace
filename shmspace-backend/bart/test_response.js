// Fake 511 StopMonitoring responses matching the real API format.
// Timestamps are relative to now so the inference math stays valid on every restart.
//
// Tube transit is ~7 min (WO ↔ Emb). The same vehicleRef appears at the entry
// stop and again 7 min later at the exit stop — just like real SIRI data would.
//
// NB: Embarcadero (entry) → tube → West Oakland (exit)
//   emb_nb #XXXX at T  →  wo_nb #XXXX at T+7
//
// SB: West Oakland (entry) → tube → Embarcadero (exit)
//   wo_sb #XXXX at T  →  emb_sb #XXXX at T+7
//
// On startup: tube is empty (all exit-stop trains > 7 min away).
// First tube activation: ~45 seconds after server start (NB Yellow-N #1106).

function makeVisit(lineRef, destName, minsFromNow, vehicleRef) {
  const arrives = new Date(Date.now() + minsFromNow * 60000).toISOString();
  return {
    MonitoredVehicleJourney: {
      LineRef: lineRef,
      DestinationName: destName,
      VehicleRef: vehicleRef || null,
      MonitoredCall: { ExpectedArrivalTime: arrives },
    },
  };
}

function makeStop(visits) {
  return {
    ServiceDelivery: {
      StopMonitoringDelivery: { MonitoredStopVisit: visits },
    },
  };
}

function makeTestResponses() {
  return {
    // ── 901162  Embarcadero NB ── trains arriving at Emb heading into tube ──────
    emb_nb: makeStop([
      makeVisit('Yellow-N', 'Antioch',                             0.75, '1106'), // → wo_nb #1106 at 7.75
      makeVisit('Blue-N',   'Dublin / Pleasanton',                    9, '1112'), // → wo_nb #1112 at 16
      makeVisit('Red-N',    'Richmond',                              17, '1118'), // → wo_nb #1118 at 24
    ]),

    // ── 901161  Embarcadero SB ── trains arriving at Emb from tube ──────────────
    // #1121 entered WO before snapshot (no wo_sb match) — enters tube zone in ~45s
    emb_sb: makeStop([
      makeVisit('Green-S',  'Daly City',                           7.75, '1121'), // entered WO before snapshot
      makeVisit('Red-S',    'San Francisco International Airport',   11, '1103'), // ← wo_sb #1103 at 4
      makeVisit('Blue-S',   'Daly City',                            19, '1109'), // ← wo_sb #1109 at 12
      makeVisit('Yellow-S', 'Millbrae (Caltrain Transfer Platform)', 27, '1115'), // ← wo_sb #1115 at 20
    ]),

    // ── 901102  West Oakland NB ── trains arriving at WO from tube ──────────────
    // same vehicleRefs as emb_nb, 7 min later
    wo_nb: makeStop([
      makeVisit('Yellow-N', 'Antioch',                             7.75, '1106'), // ← emb_nb #1106 at 0.75
      makeVisit('Blue-N',   'Dublin / Pleasanton',                   16, '1112'), // ← emb_nb #1112 at 9
      makeVisit('Red-N',    'Richmond',                              24, '1118'), // ← emb_nb #1118 at 17
    ]),

    // ── 901101  West Oakland SB ── trains arriving at WO heading into tube ──────
    // same vehicleRefs as emb_sb matches, 7 min earlier
    wo_sb: makeStop([
      makeVisit('Red-S',    'San Francisco International Airport',    4, '1103'), // → emb_sb #1103 at 11
      makeVisit('Blue-S',   'Daly City',                             12, '1109'), // → emb_sb #1109 at 19
      makeVisit('Yellow-S', 'Millbrae (Caltrain Transfer Platform)', 20, '1115'), // → emb_sb #1115 at 27
    ]),
  };
}

module.exports = { makeTestResponses };
