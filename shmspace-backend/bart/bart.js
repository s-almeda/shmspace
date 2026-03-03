const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const API_KEY = process.env.BART_API_KEY;
let cache = { trains: [], raw: null, fetchedAt: null };
let testMode = false;
let testTrains = [
  { line: 'Red', minutes: 2 },
  { line: 'Yellow', minutes: 7 },
  { line: 'Green', minutes: 12 },
  { line: 'Blue', minutes: 18 },
];

const TEST_STATE_PATH = path.join(__dirname, 'testmode-state.json');

function normalizeTestTrains(trains) {
  if (!Array.isArray(trains)) return testTrains;
  const normalized = trains
    .filter(t => t && typeof t === 'object')
    .map(t => ({
      line: String(t.line || '').trim(),
      minutes: Number(t.minutes),
    }))
    .filter(t => t.line && Number.isFinite(t.minutes));

  return normalized.length ? normalized : testTrains;
}

function loadTestState() {
  try {
    if (!fs.existsSync(TEST_STATE_PATH)) return;
    const raw = fs.readFileSync(TEST_STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    testMode = Boolean(parsed.testMode);
    if (Array.isArray(parsed.testTrains)) {
      testTrains = normalizeTestTrains(parsed.testTrains);
    }
  } catch (error) {
    console.error('Failed to load BART test state:', error.message);
  }
}

function saveTestState() {
  try {
    const payload = JSON.stringify({ testMode, testTrains }, null, 2);
    fs.writeFileSync(TEST_STATE_PATH, payload, 'utf8');
  } catch (error) {
    console.error('Failed to save BART test state:', error.message);
  }
}

loadTestState();

async function fetchBart() {
  if (testMode) return; // don't overwrite cache in test mode
  console.log('Fetching BART data...');
  const response = await fetch(
    `http://api.511.org/transit/StopMonitoring?api_key=${API_KEY}&agency=BA&stopCode=901301&format=json`,
    { headers: { 'Accept-Encoding': 'gzip' } }
  );
  const text = await response.text();
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

fetchBart().catch(console.error);
setInterval(() => fetchBart().catch(console.error), 3 * 60 * 1000);

// toggle test mode
router.post('/testmode', express.json(), (req, res) => {
  loadTestState();
  testMode = Boolean(req.body && req.body.enabled);
  if (req.body && Array.isArray(req.body.trains)) {
    testTrains = normalizeTestTrains(req.body.trains);
  }
  saveTestState();
  res.json({ testMode, testTrains });
});

// next trains — used by ESP32
router.get('/next', (req, res) => {
  loadTestState();
  if (testMode) {
    return res.json(testTrains);
  }

  if (!cache.trains.length) return res.json([]);
  const now = new Date();
  const next = cache.trains
    .filter(t => new Date(t.arrivalTime) > now)
    .sort((a, b) => new Date(a.arrivalTime) - new Date(b.arrivalTime))
    .slice(0, 5)
    .map(t => ({
      line: t.line.split('-')[0],
      minutes: Math.round((new Date(t.arrivalTime) - now) / 60000),
    }));
  res.json(next);
});

// data endpoint for frontend
router.get('/data', (req, res) => {
  loadTestState();
  res.json({ ...cache, testMode, testTrains });
});

// the webpage
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
    h1 { font-size: 1.2rem; color: #aaa; margin-bottom: 0.3rem; text-transform: uppercase; letter-spacing: 0.1em; }
    .station { font-size: 1.6rem; font-weight: bold; margin-bottom: 2rem; }
    .platform { margin-bottom: 2rem; }
    .platform-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.15em; color: #666; border-bottom: 1px solid #222; padding-bottom: 0.4rem; margin-bottom: 0.8rem; }
    .train { display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0; border-bottom: 1px solid #1a1a1a; }
    .train-info { flex: 1; }
    .train-name { font-size: 1rem; }
    .train-dest { font-size: 0.8rem; color: #888; margin-top: 0.2rem; }
    .train-time { font-size: 1.4rem; font-weight: bold; text-align: right; min-width: 80px; }
    .line-Blue { color: #4a9eff; }
    .line-Yellow { color: #ffd700; }
    .line-Red { color: #ff4444; }
    .line-Green { color: #44ff88; }
    .line-Orange { color: #ff8c00; }
    .arriving { color: #ff6b6b; animation: pulse 1s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    .footer { margin-top: 2rem; font-size: 0.75rem; color: #444; }
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

    /* test mode */
    .test-bar {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 2rem;
      padding: 0.75rem 1rem;
      background: #111;
      border: 1px solid #222;
      border-radius: 6px;
    }
    .test-bar label { font-size: 0.8rem; color: #666; cursor: pointer; display: flex; align-items: center; gap: 0.5rem; }
    .test-badge {
      font-size: 0.7rem;
      background: #ff4444;
      color: white;
      padding: 0.2rem 0.5rem;
      border-radius: 3px;
      display: none;
    }
    .test-badge.visible { display: inline; }
    .test-editor { display: none; margin-top: 1rem; }
    .test-editor.visible { display: block; }
    .test-editor textarea {
      width: 100%;
      height: 160px;
      background: #111;
      border: 1px solid #333;
      border-radius: 4px;
      color: #f0f0f0;
      font-family: 'Courier New', monospace;
      font-size: 0.8rem;
      padding: 0.75rem;
      resize: vertical;
    }
    .test-editor textarea:focus { outline: none; border-color: #555; }
    .btn {
      margin-top: 0.5rem;
      padding: 0.4rem 1rem;
      background: #222;
      border: 1px solid #444;
      color: #f0f0f0;
      font-family: 'Courier New', monospace;
      font-size: 0.8rem;
      border-radius: 4px;
      cursor: pointer;
    }
    .btn:hover { background: #333; }
    .btn.success { border-color: #44ff88; color: #44ff88; }
    .test-bar .btn { margin-top: 0; }
    .error { color: #ff4444; font-size: 0.9rem; }
    .toggle { position: relative; display: inline-block; width: 36px; height: 20px; }
    .toggle input { opacity: 0; width: 0; height: 0; }
    .slider { position: absolute; cursor: pointer; inset: 0; background: #333; border-radius: 20px; transition: 0.3s; }
    .slider:before { content: ''; position: absolute; width: 14px; height: 14px; left: 3px; bottom: 3px; background: #888; border-radius: 50%; transition: 0.3s; }
    input:checked + .slider { background: #ff4444; }
    input:checked + .slider:before { transform: translateX(16px); background: white; }
  </style>
</head>
<body>
  <h1>shm's live BART departures API</h1>
  <div class="station">Powell Street BART <span class="test-badge" id="testBadge">TEST MODE</span></div>

  <div class="test-bar">
    <label>
      <span class="toggle">
        <input type="checkbox" id="testToggle" onchange="previewTestMode()">
        <span class="slider"></span>
      </span>
      Test mode
    </label>
    <button class="btn" onclick="pushModeAndReload()">Push mode + reload</button>
  </div>

  <div class="test-editor" id="testEditor">
    <div style="font-size:0.75rem; color:#666; margin-bottom:0.5rem;">Edit test trains (JSON):</div>
    <textarea id="testJson"></textarea>
    <button class="btn" id="saveBtn" onclick="saveTestTrains()">Push to ESP32</button>
  </div>

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
    let isTestMode = false;
    const POLL_INTERVAL = 30000;

    function lineColor(lineRef) {
      return 'line-' + lineRef.split('-')[0];
    }

    function minutesUntil(isoTime) {
      return (new Date(isoTime) - new Date()) / 1000 / 60;
    }

    function renderTrains() {
      // in test mode, render directly from testTrains list
      if (isTestMode) {
        let html = '<div class="platform"><div class="platform-label">Test Sequence</div>';
        try {
          const trains = JSON.parse(document.getElementById('testJson').value);
          trains.forEach((t) => {
            const colorClass = 'line-' + t.line;
            html += '<div class="train">';
            html += '  <div class="train-info"><div class="train-name ' + colorClass + '">' + t.line + '</div></div>';
            html += '  <div class="train-time ' + colorClass + '">' + t.minutes + ' min</div>';
            html += '</div>';
          });
        } catch (e) {
          html += '<span class="error">Invalid JSON</span>';
        }
        html += '</div>';
        document.getElementById('platforms').innerHTML = html;
        return;
      }

      // normal mode
      const platforms = {};
      trainData.forEach(t => {
        const p = t.platform;
        if (!platforms[p]) platforms[p] = [];
        platforms[p].push(t);
      });

      let html = '';
      Object.keys(platforms).sort().forEach(p => {
        html += '<div class="platform"><div class="platform-label">Platform ' + p + '</div>';
        platforms[p].forEach(t => {
          const mins = minutesUntil(t.arrivalTime);
          const colorClass = lineColor(t.line);
          let timeStr, timeClass = '';
          if (mins < 1) { timeStr = 'Now'; timeClass = 'arriving'; }
          else { timeStr = Math.floor(mins) + ' min'; }
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

    function previewTestMode() {
      const enabled = document.getElementById('testToggle').checked;
      isTestMode = enabled;
      document.getElementById('testBadge').classList.toggle('visible', enabled);
      document.getElementById('testEditor').classList.toggle('visible', enabled);

      renderTrains();
    }

    async function pushModeAndReload() {
      const enabled = document.getElementById('testToggle').checked;
      let trains = null;
      if (enabled) {
        try {
          trains = JSON.parse(document.getElementById('testJson').value);
        } catch (e) {
          alert('Invalid JSON — fix it and try again');
          return;
        }
      }

      await fetch('/api/bart/testmode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, trains }),
      });

      location.reload();
    }

    async function saveTestTrains() {
      try {
        const trains = JSON.parse(document.getElementById('testJson').value);
        await fetch('/api/bart/testmode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: true, trains }),
        });
        const btn = document.getElementById('saveBtn');
        btn.textContent = 'Pushed!';
        btn.classList.add('success');
        setTimeout(() => { btn.textContent = 'Push to ESP32'; btn.classList.remove('success'); }, 2000);
        renderTrains();
      } catch (e) {
        alert('Invalid JSON — fix it and try again');
      }
    }

    async function pollServer() {
      try {
        const res = await fetch('/api/bart/data');
        const data = await res.json();
        trainData = data.trains || [];
        lastFetchedAt = data.fetchedAt;
        lastPollAt = Date.now();

        // sync test mode state from server
        if (data.testMode !== isTestMode) {
          isTestMode = data.testMode;
          document.getElementById('testToggle').checked = isTestMode;
          document.getElementById('testBadge').classList.toggle('visible', isTestMode);
          document.getElementById('testEditor').classList.toggle('visible', isTestMode);
        }

        // populate test editor if empty
        if (!document.getElementById('testJson').value) {
          document.getElementById('testJson').value = JSON.stringify(data.testTrains, null, 2);
        }

        document.getElementById('fetchedAt').textContent = lastFetchedAt ? new Date(lastFetchedAt).toLocaleTimeString() : '—';
        document.getElementById('rawJson').textContent = JSON.stringify(data.raw, null, 2);
      } catch (e) {
        console.error('Poll failed:', e);
      }
    }

    function tick() {
      renderTrains();
      if (lastPollAt) {
        const nextIn = Math.max(0, Math.round((lastPollAt + POLL_INTERVAL - Date.now()) / 1000));
        document.getElementById('nextRefresh').textContent = nextIn + 's';
      }
    }

    pollServer().then(() => renderTrains());
    setInterval(pollServer, POLL_INTERVAL);
    setInterval(tick, 1000);
  </script>
</body>
</html>`);
});

module.exports = router;