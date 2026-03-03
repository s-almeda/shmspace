const express = require('express');
const router = express.Router();

const API_KEY = '276d1e95-15ba-481a-9bf0-6a312e4fae49';
let cache = { trains: [], raw: null, fetchedAt: null };

async function fetchBart() {
  console.log('Fetching BART data...');
  const response = await fetch(
    `http://api.511.org/transit/StopMonitoring?api_key=${API_KEY}&agency=BA&stopCode=901301&format=json`,
    { headers: { 'Accept-Encoding': 'gzip' } }
  );
  const text = await response.text();
  // strip BOM if present
  const cleaned = text.replace(/^\uFEFF/, '');
  const data = JSON.parse(cleaned);
  const visits = data.ServiceDelivery.StopMonitoringDelivery.MonitoredStopVisit;

  cache = {
    trains: visits.map(v => {
      const j = v.MonitoredVehicleJourney;
      return {
        line: j.LineRef,
        destination: j.DestinationName,
        origin: j.OriginName,
        publishedName: j.PublishedLineName,
        arrivalTime: j.MonitoredCall.ExpectedArrivalTime,
        platform: j.DirectionRef === 'S' ? 1 : 2,
      };
    }),
    raw: data,
    fetchedAt: new Date().toISOString(),
  };
}

// fetch immediately on startup, then every 5 minutes
fetchBart().catch(console.error);
setInterval(() => fetchBart().catch(console.error), 5 * 60 * 1000);

// API endpoint for frontend to poll
router.get('/data', (req, res) => {
  res.json(cache);
});

// the webpage itself
router.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Powell St BART</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0a0a0a;
      color: #f0f0f0;
      font-family: 'Courier New', monospace;
      padding: 2rem;
      max-width: 700px;
      margin: 0 auto;
    }
    h1 {
      font-size: 1.2rem;
      color: #aaa;
      margin-bottom: 0.3rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
    .station { font-size: 1.6rem; font-weight: bold; margin-bottom: 2rem; }
    .platform { margin-bottom: 2rem; }
    .platform-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      color: #666;
      border-bottom: 1px solid #222;
      padding-bottom: 0.4rem;
      margin-bottom: 0.8rem;
    }
    .train {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.6rem 0;
      border-bottom: 1px solid #1a1a1a;
    }
    .train-info { flex: 1; }
    .train-name { font-size: 1rem; }
    .train-dest { font-size: 0.8rem; color: #888; margin-top: 0.2rem; }
    .train-time {
      font-size: 1.4rem;
      font-weight: bold;
      text-align: right;
      min-width: 80px;
    }
    .line-Blue { color: #4a9eff; }
    .line-Yellow { color: #ffd700; }
    .line-Red { color: #ff4444; }
    .line-Green { color: #44ff88; }
    .line-Orange { color: #ff8c00; }
    .arriving { color: #ff6b6b; animation: pulse 1s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    .footer {
      margin-top: 2rem;
      font-size: 0.75rem;
      color: #444;
    }
    .footer span { color: #666; }
    .json-box {
      margin-top: 1rem;
      background: #111;
      border: 1px solid #222;
      border-radius: 4px;
      padding: 1rem;
      height: 200px;
      overflow-y: scroll;
      font-size: 0.7rem;
      color: #555;
      white-space: pre;
    }
    .error { color: #ff4444; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>Live Departures</h1>
  <div class="station">Powell Street BART</div>
  <div id="platforms"><span class="error">Loading...</span></div>
  <div class="footer">
    Last updated by transit agency: <span id="fetchedAt">—</span><br>
    Next API refresh in: <span id="nextRefresh">—</span>
  </div>
  <div class="json-box" id="rawJson"></div>

  <script>
    let trainData = [];
    let lastFetchedAt = null;
    let lastPollAt = null;
    const POLL_INTERVAL = 30 * 1000;

    function lineColor(lineRef) {
      const color = lineRef.split('-')[0];
      return 'line-' + color;
    }

    function minutesUntil(isoTime) {
      return (new Date(isoTime) - new Date()) / 1000 / 60;
    }

    function renderTrains() {
      const platforms = {};
      trainData.forEach(t => {
        const p = t.platform;
        if (!platforms[p]) platforms[p] = [];
        platforms[p].push(t);
      });

      let html = '';
      Object.keys(platforms).sort().forEach(p => {
        html += '<div class="platform">';
        html += '<div class="platform-label">Platform ' + p + '</div>';
        platforms[p].forEach(t => {
          const mins = minutesUntil(t.arrivalTime);
          const colorClass = lineColor(t.line);
          let timeStr, timeClass = '';
          if (mins < 1) {
            timeStr = 'Now';
            timeClass = 'arriving';
          } else {
            timeStr = Math.floor(mins) + ' min';
          }
          html += '<div class="train">';
          html += '  <div class="train-info">';
          html += '    <div class="train-name ' + colorClass + '">' + t.line.replace('-', ' ') + '</div>';
          html += '    <div class="train-dest">' + t.publishedName + '</div>';
          html += '  </div>';
          html += '  <div class="train-time ' + colorClass + ' ' + timeClass + '">' + timeStr + '</div>';
          html += '</div>';
        });
        html += '</div>';
      });

      document.getElementById('platforms').innerHTML = html || '<span class="error">No trains found</span>';
    }

    async function pollServer() {
      try {
        const res = await fetch('/api/bart/data');
        const data = await res.json();
        trainData = data.trains || [];
        lastFetchedAt = data.fetchedAt;
        lastPollAt = Date.now();
        document.getElementById('fetchedAt').textContent = new Date(lastFetchedAt).toLocaleTimeString();
        document.getElementById('rawJson').textContent = JSON.stringify(data.raw, null, 2);
      } catch (e) {
        console.error('Poll failed:', e);
      }
    }

    // tick every second to keep countdowns live
    function tick() {
      renderTrains();
      if (lastPollAt) {
        const nextIn = Math.max(0, Math.round((lastPollAt + POLL_INTERVAL - Date.now()) / 1000));
        document.getElementById('nextRefresh').textContent = nextIn + 's';
      }
    }

    // start
    pollServer().then(() => renderTrains());
    setInterval(pollServer, POLL_INTERVAL);
    setInterval(tick, 1000);
  </script>
</body>
</html>`);
});

module.exports = router;