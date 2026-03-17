const TEST_MODE = true; // set true to use test_response.js instead of calling 511

const API_KEY = process.env.BART_API_KEY;

const STOPS = {
  emb_nb: '901162', // Embarcadero Northbound
  emb_sb: '901161', // Embarcadero Southbound
  wo_nb:  '901102', // West Oakland Northbound
  wo_sb:  '901101', // West Oakland Southbound
};

let cache = {
  emb_nb: [],
  emb_sb: [],
  wo_nb: [],
  wo_sb: [],
  fetchedAt: null,
};

// Parses a 511 StopMonitoring response object (real or fake) into normalized trains.
function parseStop(data) {
  const raw = data.ServiceDelivery.StopMonitoringDelivery.MonitoredStopVisit || [];
  const visits = Array.isArray(raw) ? raw : [raw];
  return visits.map(v => ({
    line:       v.MonitoredVehicleJourney.LineRef,
    dest:       v.MonitoredVehicleJourney.DestinationName,
    arrives:    v.MonitoredVehicleJourney.MonitoredCall.ExpectedArrivalTime,
    vehicleRef: v.MonitoredVehicleJourney.VehicleRef || null,
  }));
}

async function fetchStop(stopCode) {
  const url = `http://api.511.org/transit/StopMonitoring?api_key=${API_KEY}&agency=BA&stopCode=${stopCode}&format=json`;
  const res = await fetch(url, { headers: { 'Accept-Encoding': 'gzip' } });
  const text = await res.text();
  return parseStop(JSON.parse(text.replace(/^\uFEFF/, '')));
}

async function fetchAll() {
  if (TEST_MODE) {
    console.log('[tube fetcher] TEST MODE — using test_response.js');
    const { makeTestResponses } = require('./test_response');
    const r = makeTestResponses();
    cache = {
      emb_nb: parseStop(r.emb_nb),
      emb_sb: parseStop(r.emb_sb),
      wo_nb:  parseStop(r.wo_nb),
      wo_sb:  parseStop(r.wo_sb),
      fetchedAt: new Date().toISOString(),
      testMode: true,
    };
    return;
  }

  console.log('[tube fetcher] fetching all 4 transbay stops...');
  try {
    const [emb_nb, emb_sb, wo_nb, wo_sb] = await Promise.all([
      fetchStop(STOPS.emb_nb),
      fetchStop(STOPS.emb_sb),
      fetchStop(STOPS.wo_nb),
      fetchStop(STOPS.wo_sb),
    ]);
    cache = { emb_nb, emb_sb, wo_nb, wo_sb, fetchedAt: new Date().toISOString(), testMode: false };
    console.log('[tube fetcher] done.');
  } catch (e) {
    console.error('[tube fetcher] fetch failed:', e.message);
  }
}

fetchAll();
setInterval(fetchAll, 5 * 60 * 1000);

module.exports = { getCache: () => cache };
