/*
Puppet rig server routes — extracted from App.js so all puppet-related
server code lives alongside the rig (public/puppets/).

Usage in App.js:
    const publicPath = path.join(__dirname, 'public');
    app.use(require('./public/puppets/puppet_routes')(publicPath));

Note: this file sits under the express.static(public) dir, so its source is
fetchable at /puppets/puppet_routes.js. It holds no secrets (just route logic).
*/

const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const MEDIA_RE = /\.(png|jpg|jpeg|gif|webp|mp4|webm|mov)$/i;
// Names (collections / shows) must be a single safe path segment — no slashes and
// no ".." traversal.
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;
const isSafeName = (s) => typeof s === 'string' && SAFE_NAME.test(s) && !s.includes('..');

// List media files in a dir, sorted. Returns [] if the dir is missing.
function safeList(dir) {
    try {
        return fs.readdirSync(dir).filter(f => MEDIA_RE.test(f)).sort();
    } catch (e) { return []; }
}

// List subdirectory names in a dir, sorted. Returns [] if the dir is missing.
function safeListDirs(dir) {
    try {
        return fs.readdirSync(dir, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => d.name)
            .sort();
    } catch (e) { return []; }
}

module.exports = (publicPath) => {
    const router = express.Router();
    const puppetsRoot = path.join(publicPath, 'puppets');

    // Rig entry point — /puppets and /puppets?show=<name>
    router.get('/puppets', function (_req, res) {
        res.sendFile(path.join(puppetsRoot, 'index.html'));
    });

    // Raw source view — /puppets/source serves index.html as text/plain so a
    // browser shows the markup instead of rendering it. Handy as a clickable
    // "view the HTML" link (view-source: can't be linked to directly).
    router.get(['/puppets/source', '/puppets/source/index.html'], function (_req, res) {
        res.type('text/plain; charset=utf-8');
        res.sendFile(path.join(puppetsRoot, 'index.html'));
    });

    // Directory page + its data (rigs, shows, tool pages). Dynamic here; baked into
    // directory-data.json at build time for prod (build-manifests.js + vercel rewrites).
    router.get('/puppets/directory', function (_req, res) {
        res.sendFile(path.join(puppetsRoot, 'directory.html'));
    });
    router.get('/puppets/directory-data', function (_req, res) {
        const rigs = (() => {
            try {
                return fs.readdirSync(puppetsRoot)
                    .filter(f => /^rig\..+\.json$/.test(f))
                    .map(f => {
                        const name = f.replace(/^rig\./, '').replace(/\.json$/, '');
                        let title = null, features = [];
                        try { const j = JSON.parse(fs.readFileSync(path.join(puppetsRoot, f), 'utf8')); title = j.title || null; features = j.features || []; } catch (e) {}
                        return { name, title, features };
                    }).sort((a, b) => a.name.localeCompare(b.name));
            } catch (e) { return []; }
        })();
        const pages = (() => {
            try { return fs.readdirSync(puppetsRoot).filter(f => /\.html$/i.test(f) && f !== 'index.html' && f !== 'directory.html').sort(); }
            catch (e) { return []; }
        })();
        // local: true — this is the full directory (every rig, show and tool page). The
        // deployed build emits a trimmed version with local:false; see build-manifests.js.
        res.json({ local: true, rigs, shows: safeListDirs(path.join(puppetsRoot, 'shows')), pages });
    });

    // Available puppet collections — the subfolders shared by hand_puppets/ &
    // head_puppets/ (e.g. ["cs10", "default", "lightning_talk"]). Driven off
    // hand_puppets since every collection has hand puppets; head puppets are optional.
    router.get('/puppets/collections', function (_req, res) {
        res.json(safeListDirs(path.join(puppetsRoot, 'hand_puppets')));
    });

    // Hand puppet listing for a collection
    router.get('/puppets/hand-puppets-list/:collection', function (req, res) {
        const c = req.params.collection;
        if (!isSafeName(c)) return res.status(400).json([]);
        res.json(safeList(path.join(puppetsRoot, 'hand_puppets', c)));
    });

    // Head puppet listing for a collection (may be empty — head puppets are optional)
    router.get('/puppets/head-puppets-list/:collection', function (req, res) {
        const c = req.params.collection;
        if (!isSafeName(c)) return res.status(400).json([]);
        res.json(safeList(path.join(puppetsRoot, 'head_puppets', c)));
    });

    // Show script
    router.get('/puppets/shows/:show/script', function (req, res) {
        res.sendFile(path.join(puppetsRoot, 'shows', req.params.show, 'game_script.json'));
    });

    // Optional per-show rig manifest (feature opt-in). 404 when absent so the
    // client falls back to default features — legacy shows simply have no rig.json.
    router.get('/puppets/shows/:show/rig', function (req, res) {
        const show = req.params.show;
        if (!isSafeName(show)) return res.status(400).json({ error: 'bad show name' });
        const file = path.join(puppetsRoot, 'shows', show, 'rig.json');
        res.sendFile(file, (err) => { if (err && !res.headersSent) res.status(404).json({ error: 'no rig manifest' }); });
    });

    // Save a show script — LOCALHOST ONLY. The public site (shmuh.co/puppets) must
    // never be able to write scripts: (1) we reject any non-loopback request here,
    // and (2) Vercel's serverless filesystem is read-only anyway. Editing is the
    // local `node App.js` → git-commit workflow.
    function isLoopback(req) {
        const ip = req.socket.remoteAddress || '';
        return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    }
    router.post('/puppets/shows/:show/script', express.json({ limit: '4mb' }), function (req, res) {
        if (!isLoopback(req)) return res.status(403).json({ error: 'script editing is local-only' });
        const show = req.params.show;
        if (!isSafeName(show)) return res.status(400).json({ error: 'bad show name' });
        if (!Array.isArray(req.body)) return res.status(400).json({ error: 'expected a scene array' });
        const file = path.join(puppetsRoot, 'shows', show, 'game_script.json');
        try {
            fs.writeFileSync(file, JSON.stringify(req.body, null, 2) + '\n');
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ error: String(e) });
        }
    });

    // ── Local "teachable" object-detection dataset + training (LOCALHOST ONLY) ──
    // Same policy as script saving: reject non-loopback, and Vercel's FS is read-only.
    const datasetDir = path.join(puppetsRoot, 'potato_model', 'dataset');
    const modelDir   = path.join(puppetsRoot, 'potato_model');

    // Capture one auto-labeled frame into a YOLO dataset (images/ + labels/ + data.yaml).
    router.post('/puppets/capture', express.json({ limit: '12mb' }), function (req, res) {
        if (!isLoopback(req)) return res.status(403).json({ error: 'capture is local-only' });
        const { filename, dataUrl, label } = req.body || {};
        if (!isSafeName(filename)) return res.status(400).json({ error: 'bad filename' });
        if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
            return res.status(400).json({ error: 'bad image data' });
        }
        if (typeof label !== 'string' || !/^[0-9.\s]+$/.test(label)) {
            return res.status(400).json({ error: 'bad label' });
        }
        const b64 = dataUrl.split(',')[1] || '';
        const imgDir = path.join(datasetDir, 'images');
        const lblDir = path.join(datasetDir, 'labels');
        try {
            fs.mkdirSync(imgDir, { recursive: true });
            fs.mkdirSync(lblDir, { recursive: true });
            fs.writeFileSync(path.join(imgDir, filename + '.jpg'), Buffer.from(b64, 'base64'));
            fs.writeFileSync(path.join(lblDir, filename + '.txt'), label + '\n');
            // (Re)write data.yaml. Tiny single-object dataset: train == val (we WANT it to
            // memorize this potato in this setting).
            const yaml = `path: ${datasetDir}\ntrain: images\nval: images\nnc: 1\nnames: ['potato']\n`;
            fs.writeFileSync(path.join(datasetDir, 'data.yaml'), yaml);
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ error: String(e) });
        }
    });

    // Enroll / clear a face identity — LOCALHOST ONLY. Appends a 128-d descriptor to the
    // roster under <label>, or clears that label. Roster is a JSON array:
    //   [ { "label": "shm", "descriptors": [[...128...], ...] }, ... ]
    router.post('/puppets/roster', express.json({ limit: '1mb' }), function (req, res) {
        if (!isLoopback(req)) return res.status(403).json({ error: 'roster editing is local-only' });
        const { label, descriptor, clear } = req.body || {};
        if (!isSafeName(label)) return res.status(400).json({ error: 'bad label' });
        const file = path.join(puppetsRoot, 'face_ids', 'roster.json');
        let roster = [];
        try { roster = JSON.parse(fs.readFileSync(file, 'utf8')); if (!Array.isArray(roster)) roster = []; } catch (e) { /* new file */ }

        if (clear) {
            roster = roster.filter(p => p.label !== label);
        } else {
            if (!Array.isArray(descriptor) || descriptor.length !== 128 || !descriptor.every(n => typeof n === 'number')) {
                return res.status(400).json({ error: 'descriptor must be 128 numbers' });
            }
            let entry = roster.find(p => p.label === label);
            if (!entry) { entry = { label, descriptors: [] }; roster.push(entry); }
            entry.descriptors.push(descriptor);
        }
        try {
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, JSON.stringify(roster));
            const cur = roster.find(p => p.label === label);
            res.json({ ok: true, count: cur ? cur.descriptors.length : 0 });
        } catch (e) {
            res.status(500).json({ error: String(e) });
        }
    });

    // Save the whole roster (from the roster editor) — LOCALHOST ONLY. Validates each
    // entry: safe label, descriptor arrays intact, optional #rrggbb color + string name.
    router.post('/puppets/roster-save', express.json({ limit: '8mb' }), function (req, res) {
        if (!isLoopback(req)) return res.status(403).json({ error: 'roster editing is local-only' });
        const roster = req.body;
        if (!Array.isArray(roster)) return res.status(400).json({ error: 'expected an array' });
        for (const p of roster) {
            if (!isSafeName(p.label)) return res.status(400).json({ error: 'bad label: ' + p.label });
            if (!Array.isArray(p.descriptors)) return res.status(400).json({ error: 'bad descriptors for ' + p.label });
            if (p.color !== undefined && !(typeof p.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(p.color))) {
                return res.status(400).json({ error: 'bad color for ' + p.label });
            }
            if (p.name !== undefined && typeof p.name !== 'string') return res.status(400).json({ error: 'bad name for ' + p.label });
        }
        const file = path.join(puppetsRoot, 'face_ids', 'roster.json');
        try {
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, JSON.stringify(roster));
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ error: String(e) });
        }
    });

    // List reference photos in face_ids/refs/<label>/ (for folder-based enrollment).
    router.get('/puppets/roster-refs/:label', function (req, res) {
        const label = req.params.label;
        if (!isSafeName(label)) return res.status(400).json([]);
        const dir = path.join(puppetsRoot, 'face_ids', 'refs', label);
        try {
            res.json(fs.readdirSync(dir).filter(f => /\.(png|jpe?g|webp|gif)$/i.test(f)).sort());
        } catch (e) { res.json([]); }
    });

    // Dataset file list (for the review page) — basenames that have both image + label.
    router.get('/puppets/dataset-list', function (_req, res) {
        try {
            const imgs = fs.readdirSync(path.join(datasetDir, 'images')).filter(f => /\.jpg$/i.test(f));
            res.json(imgs.map(f => f.replace(/\.jpg$/i, '')).sort());
        } catch (e) { res.json([]); }
    });

    // Training status (polled by the capture module).
    let trainStatus = { running: false, done: false, error: null, tail: '', code: null };
    let trainProc = null;
    router.get('/puppets/train-status', function (_req, res) { res.json(trainStatus); });

    // Kick off local training. Spawns the venv Python (POTATO_PYTHON env or
    // potato_model/train_config.json → "python", else "python3") on scripts/train_potato.py,
    // which finetunes YOLOv8 and exports potato_model/potato.onnx.
    router.post('/puppets/train', express.json(), function (req, res) {
        if (!isLoopback(req)) return res.status(403).json({ error: 'training is local-only' });
        if (trainStatus.running) return res.status(409).json({ error: 'already training' });
        const dataYaml = path.join(datasetDir, 'data.yaml');
        if (!fs.existsSync(dataYaml)) return res.status(400).json({ error: 'no dataset yet — capture frames first' });

        let py = process.env.POTATO_PYTHON;
        try {
            const cfg = JSON.parse(fs.readFileSync(path.join(modelDir, 'train_config.json'), 'utf8'));
            if (cfg.python) py = cfg.python;
        } catch (e) { /* no config → fall through */ }
        py = py || 'python3';

        const script  = path.join(publicPath, '..', 'scripts', 'train_potato.py');
        const onnxOut = path.join(modelDir, 'potato.onnx');
        const imgsz   = String(parseInt(req.body?.imgsz, 10) || 640);
        const epochs  = String(parseInt(req.body?.epochs, 10) || 80);
        const logPath = path.join(modelDir, 'train.log');

        trainStatus = { running: true, done: false, error: null, tail: 'starting…', code: null };
        const log = fs.createWriteStream(logPath, { flags: 'w' });
        try {
            trainProc = spawn(py, [script, dataYaml, onnxOut, imgsz, epochs], { cwd: modelDir });
        } catch (e) {
            trainStatus = { running: false, done: false, error: String(e), tail: '', code: null };
            return res.status(500).json({ error: String(e) });
        }
        const onData = (b) => { const s = b.toString(); log.write(s); const line = s.trim().split('\n').pop(); if (line) trainStatus.tail = line.slice(0, 200); };
        trainProc.stdout.on('data', onData);
        trainProc.stderr.on('data', onData);
        trainProc.on('close', (code) => {
            trainStatus.running = false; trainStatus.code = code;
            trainStatus.done = code === 0;
            if (code !== 0) trainStatus.error = 'python exited with code ' + code + ' (see potato_model/train.log)';
            log.end(); trainProc = null;
        });
        trainProc.on('error', (e) => {
            trainStatus.running = false; trainStatus.error = String(e) + ' (check the python path in train_config.json)';
            log.end(); trainProc = null;
        });
        res.json({ ok: true, python: py });
    });

    return router;
};
