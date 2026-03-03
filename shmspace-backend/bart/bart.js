const express = require('express');
const router = express.Router();

const API_KEY = '276d1e95-15ba-481a-9bf0-6a312e4fae49';
let cache = { trains: [], raw: null, fetchedAt: null };

let testMode = false;
let testTrains = [
  { line: 'Red',    minutes: 2  },
  { line: 'Yellow', minutes: 7  },
  { line: 'Green',  minutes: 12 },
  { line: 'Blue',   minutes: 18 },
];

router.post('/testmode', express.json(), (req, res) => {
  testMode = Boolean(req.body.enabled);
  if (Array.isArray(req.body.trains)) testTrains = req.body.trains;
  res.json({ testMode, testTrains });
});

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
  res.json({ ...cache, testMode, testTrains });
});

router.get('/next', (req, res) => {
  if (testMode) return res.json(testTrains);
  if (!cache.trains.length) return res.json([]);
  const now = new Date();
  const next = cache.trains
    .filter(t => new Date(t.arrivalTime) > now)
    .sort((a, b) => new Date(a.arrivalTime) - new Date(b.arrivalTime))
    .slice(0, 5)
    .map(t => ({
      line: t.line.split('-')[0],
      minutes: Math.round((new Date(t.arrivalTime) - now) / 60000)
    }));
  res.json(next);
});

// the webpage itself
router.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Powell St BART</title>

  <div class="test-bar" style="display:flex; align-items:center; gap:1rem; margin-bottom:2rem; padding:0.75rem 1rem; background:#111; border:1px solid #222; border-radius:6px;">
    <label style="font-size:0.8rem; color:#666; display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
      <span style="position:relative; display:inline-block; width:36px; height:20px;">
        <input type="checkbox" id="testToggle" style="opacity:0; width:0; height:0;">
        <span id="sliderTrack" style="position:absolute; cursor:pointer; inset:0; background:#333; border-radius:20px; transition:0.3s;"></span>
        <span id="sliderThumb" style="position:absolute; width:14px; height:14px; left:3px; bottom:3px; background:#888; border-radius:50%; transition:0.3s;"></span>
      </span>
      Test mode
    </label>
    <button onclick="pushTestMode()" style="padding:0.4rem 1rem; background:#222; border:1px solid #444; color:#f0f0f0; font-family:'Courier New',monospace; font-size:0.8rem; border-radius:4px; cursor:pointer;" id="testBtn">Push</button>
    <span id="testBadge" style="display:none; font-size:0.7rem; background:#ff4444; color:white; padding:0.2rem 0.5rem; border-radius:3px;">TEST MODE</span>
  </div>

  <div id="testEditor" style="display:none; margin-bottom:2rem;">
    <div style="font-size:0.75rem; color:#666; margin-bottom:0.5rem;">Editing what ESP32 receives:</div>
    <textarea id="testJson" style="width:100%; height:160px; background:#111; border:1px solid #333; border-radius:4px; color:#f0f0f0; font-family:'Courier New',monospace; font-size:0.8rem; padding:0.75rem; resize:vertical;"></textarea>
  </div>

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
      height: 500px;
      overflow-y: scroll;
      font-size: 1.1rem;
      color: #bcbcbc;
      white-space: pre;
    }
    .error { color: #ff4444; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>shm's live BART departures API</h1>
  <div class="station">Powell Street BART</div>
  <div id="platforms"><span class="error">Loading...</span></div>
  <div class="footer">
    Last updated by transit agency: <span id="fetchedAt">—</span><br>
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

    async function pushTestMode() {
      const enabled = document.getElementById('testToggle').checked;
      let trains = testTrainsCache;
      try { trains = JSON.parse(document.getElementById('testJson').value); } catch(e) {}

      const res = await fetch('/api/bart/testmode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, trains })
      });
      const data = await res.json();

      const btn = document.getElementById('testBtn');
      btn.textContent = 'Pushed!';
      btn.style.color = '#44ff88';
      btn.style.borderColor = '#44ff88';
      setTimeout(() => { btn.textContent = 'Push'; btn.style.color = ''; btn.style.borderColor = ''; }, 2000);

      document.getElementById('testBadge').style.display = enabled ? 'inline' : 'none';
      document.getElementById('testEditor').style.display = enabled ? 'block' : 'none';
      document.getElementById('sliderTrack').style.background = enabled ? '#ff4444' : '#333';
      document.getElementById('sliderThumb').style.transform = enabled ? 'translateX(16px)' : '';
      document.getElementById('sliderThumb').style.background = enabled ? 'white' : '#888';
    }

    let testTrainsCache = [];

    async function pollServer() {
      try {
        const res = await fetch('/api/bart/data');
        const data = await res.json();
        trainData = data.trains || [];
        lastFetchedAt = data.fetchedAt;
        lastPollAt = Date.now();

        testTrainsCache = data.testTrains || [];
        if (!document.getElementById('testJson').value) {
          document.getElementById('testJson').value = JSON.stringify(data.testTrains, null, 2);
        }
        const isTest = data.testMode;
        document.getElementById('testBadge').style.display = isTest ? 'inline' : 'none';
        document.getElementById('testEditor').style.display = isTest ? 'block' : 'none';
        document.getElementById('testToggle').checked = isTest;
        document.getElementById('sliderTrack').style.background = isTest ? '#ff4444' : '#333';
        document.getElementById('sliderThumb').style.transform = isTest ? 'translateX(16px)' : '';
        document.getElementById('sliderThumb').style.background = isTest ? 'white' : '#888';
        
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