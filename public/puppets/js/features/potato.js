// ── Feature module: potato ────────────────────────────────────────────────
// Real object detection for a potato, tracked live (works even when thrown).
// Runs a self-trained YOLOv8n model (public/puppets/potato_model/potato.onnx) in the
// browser via onnxruntime-web — a runtime fully separate from the page's TF.js 1.7.4,
// so it can't disturb the race model. Detection runs on its own async cadence; the box
// is LERP-smoothed and drawn every frame so a thrown potato reads as tracked.
//
// Scene control (show mode):
//   "potato": true            → run detection this scene
//   "potatoManualTrigger": true → arm the manual fallback ('p' pins the overlay to the
//                                  holding hand — a safety net for the live show)
//   "potatoOverlay": "foo.png"  → graphic drawn on the potato (from the show's stage/ dir)
// In freeplay the "detect potatoes" checkbox drives it, on by default.
//
// Model hosting: the .onnx is ~12MB. In prod we pull it from jsDelivr, which serves it
// straight out of the public GitHub repo at zero bandwidth cost to us; locally we use the
// file on disk (faster, works offline). The CDN URL is pinned to a tag so jsDelivr can
// cache it permanently — bump MODEL_TAG when you retrain and re-tag.
//
// The file IS still present in the Vercel deploy (a .vercelignore doesn't exclude it —
// Vercel only honours that for CLI deploys, not Git-integration builds), but nothing ever
// requests that copy, so it costs deployment storage and no bandwidth. To actually keep it
// out of the deploy it would have to live outside public/.

const MODEL_TAG   = 'v2.5.0';
const MODEL_PATH  = '/puppets/potato_model/potato.onnx';
const IS_LOCAL    = ['localhost', '127.0.0.1', '::1', ''].includes(location.hostname);
const MODEL_URL   = IS_LOCAL
  ? MODEL_PATH
  : `https://cdn.jsdelivr.net/gh/s-almeda/shmspace@${MODEL_TAG}/public/puppets/potato_model/potato.onnx`;
const MODEL_META  = '/puppets/potato_model/potato.meta.json'; // {imgsz} written by training
const ORT_VERSION = '1.20.1';
const ORT_BASE    = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;

// Class order baked into the model. We don't care which kind of potato it is — treat
// everything except "Noise" as "potato" and track the single strongest detection.
const CLASS_NAMES   = ['Bud','Damaged potato','Defected potato','Diseased-fungal potato','Noise','Potato','Sprouted potato'];
// The current model has 7 classes; we treat every class as "potato" except "Noise" (idx 4).
// If you retrain with a different class set (e.g. a single "potato" class), all classes count.
const NOISE_IDX = 4;

const RUN_EVERY = 2; // run inference every Nth animation frame (cheaper; box is smoothed)

// How hard the drawn box chases the latest detection (1 = snap instantly). Kept high
// because a thrown potato moves fast and a laggy box reads as broken tracking. This used
// to be a "smooth" slider, but there's one good value — so it's a constant.
const TRACK_LERP = 0.95;

// Lazily inject the onnxruntime-web UMD bundle (sets window.ort). Kept out of the page
// <head> so it only loads when the potato feature is enabled.
function loadOrt() {
  if (window.ort) return Promise.resolve(window.ort);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = ORT_BASE + 'ort.min.js';
    s.onload  = () => resolve(window.ort);
    s.onerror = () => reject(new Error('failed to load onnxruntime-web'));
    document.head.appendChild(s);
  });
}

function iou(a, b) {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (a.w * a.h + b.w * b.h - inter || 1);
}

export default {
  id: 'potato',
  session: null,
  inputName: null,
  outputName: null,
  size: 320,          // model input side (read from the model at load)
  ort: null,

  canvas: null, g: null,
  frame: 0, busy: false,
  det: null,          // latest detection in element space {x,y,w,h,score}
  smooth: null,       // LERP-smoothed box actually drawn
  missCount: 0,       // frames since last hit (for fade-out)

  active: true, armed: true, manualActive: false,
  loading: false, loadError: false,   // background model-load state (see initModel)
  overlay: null,      // <img>/<video> drawn on the potato, or null
  offCanvas: null, offCtx: null,

  // Synchronous setup only — the ~12MB model download is kicked off WITHOUT awaiting so it
  // never sits between the visitor and the "it's showtime!" button. onFrame reports
  // "loading…" until the session resolves.
  async loadModels(ctx) {
    // Own overlay layer, CSS-mirrored to match the mirrored webcam (same convention as
    // faceCanvas/handCanvas — boxes drawn at raw element coords then appear mirror-aligned).
    this.canvas = ctx.createLayer('potatoCanvas', { zIndex: 7 });
    this.canvas.style.transform = 'scaleX(-1)';
    this.g = this.canvas.getContext('2d');

    // Off until the visitor switches it on — the model is still downloading at this point,
    // and a checkbox that's checked but does nothing reads as broken. Show mode: per scene.
    this.active = false;
    this.armed  = !ctx.isShowMode;

    // Analysis-panel controls.
    this.panelEl = ctx.registerPanelHTML(`
      <div class="field-row" id="potato-row" style="flex-direction:column; align-items:stretch; gap:2px;">
        <div style="display:flex; justify-content:space-between;"><b>🥔 potato</b><span id="potato-status">idle</span></div>
        <span><input type="checkbox" id="potato-on"><label for="potato-on">detect potatoes</label></span>
        <label style="display:flex; gap:4px; align-items:center;">conf
          <input type="range" id="potato-conf" min="0.05" max="0.9" step="0.05" value="0.3" style="flex:1;"></label>
        <span style="font-size:10px; line-height:1.25; color:#5a5a4a; white-space:normal;">aka: how confident should we be before calling something a potato</span>
      </div>`);
    this.confEl   = this.panelEl.querySelector('#potato-conf');
    this.statusEl = this.panelEl.querySelector('#potato-status');
    this.onEl     = this.panelEl.querySelector('#potato-on');
    this.onEl.checked  = this.active;
    this.onEl.disabled = true;          // re-enabled by initModel() once the session exists
    this.onEl.addEventListener('change', (e) => {
      this.active = e.target.checked;
      if (!this.active) { this.det = null; this.smooth = null; }
    });

    // Manual fallback key ('p') — only responds while armed (potato scene / freeplay).
    document.addEventListener('keydown', (ev) => {
      if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA' || ev.target.isContentEditable) return;
      if (ev.key.toLowerCase() !== 'p' || !this.armed) return;
      this.manualActive = !this.manualActive;
    });

    this.initModel();   // deliberately not awaited
  },

  // Fetch onnxruntime + the model in the background. Sets this.session when ready.
  async initModel() {
    this.loading = true;
    try {
      this.ort = await loadOrt();
      // WASM backend, single-threaded → no SharedArrayBuffer / cross-origin-isolation needed.
      this.ort.env.wasm.wasmPaths  = ORT_BASE;
      this.ort.env.wasm.numThreads = 1;

      const session = await this.ort.InferenceSession.create(MODEL_URL, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
      this.inputName  = session.inputNames[0];
      this.outputName = session.outputNames[0];

      // Input side length: prefer the sidecar potato.meta.json written by training, then the
      // model's own static input dim, else the 320 default.
      try {
        const meta = await fetch(MODEL_META).then(r => r.ok ? r.json() : null);
        if (meta?.imgsz) this.size = meta.imgsz;
      } catch (e) { /* no meta → fall through */ }
      const inMeta = session.inputMetadata?.[0] ?? session.inputMetadata?.[this.inputName];
      const dims = inMeta?.dimensions || inMeta?.shape;
      if (this.size === 320 && dims && dims[2] > 0) this.size = dims[2];

      this.offCanvas = document.createElement('canvas');
      this.offCanvas.width = this.offCanvas.height = this.size;
      this.offCtx = this.offCanvas.getContext('2d', { willReadFrequently: true });

      this.session = session;   // set last — onFrame treats this as "ready"
      if (this.onEl) this.onEl.disabled = false;
      if (this.statusEl && !this.active) this.statusEl.textContent = 'ready';
      console.log(`[potato] model ready — input "${this.inputName}" @ ${this.size}px, output "${this.outputName}"`);
    } catch (e) {
      this.loadError = true;
      if (this.statusEl) this.statusEl.textContent = 'unavailable';
      console.warn('[potato] model failed to load', e);
    }
    this.loading = false;
  },

  onScene(scene, ctx) {
    this.active = !!scene.potato;
    this.armed  = !!scene.potatoManualTrigger;
    if (this.onEl) this.onEl.checked = this.active;
    if (!this.active && !this.armed) this.manualActive = false;
    this.overlay = null;
    if (scene.potatoOverlay) {
      const src = scene.potatoOverlay.startsWith('/')
        ? scene.potatoOverlay
        : `/puppets/shows/${ctx.showName}/stage/${scene.potatoOverlay}`;
      this.overlay = ctx.makeMediaEl(src);
    }
  },

  onFrame(video, ctx) {
    const g = this.g;
    if (!g) return;
    const rect = video.getBoundingClientRect();
    const elemW = rect.width, elemH = rect.height;
    if (this.canvas.width !== elemW)  this.canvas.width  = elemW;
    if (this.canvas.height !== elemH) this.canvas.height = elemH;
    g.clearRect(0, 0, elemW, elemH);

    // Nothing to do unless we're running detection or the manual net is pulled.
    if (!this.active && !this.manualActive) {
      if (this.statusEl) {
        this.statusEl.textContent = this.loadError ? 'unavailable' : (this.session ? 'ready' : 'loading model…');
      }
      return;
    }

    // Manual fallback: pin the overlay to the primary hand's palm, no inference.
    if (this.manualActive) {
      if (this.statusEl) this.statusEl.textContent = 'MANUAL';
      const hands = ctx.handLandmarks;
      if (hands && hands.length) {
        const lm = hands[0];
        const px = ((lm[0].x + lm[9].x) / 2) * elemW;
        const py = ((lm[0].y + lm[9].y) / 2) * elemH;
        const s  = elemW * 0.18;
        this.drawAt(g, px - s / 2, py - s / 2, s, s);
      }
      return;
    }

    // Model is still downloading in the background (or failed) — say so rather than
    // silently doing nothing. The manual fallback above still works meanwhile.
    if (!this.session) {
      if (this.statusEl) this.statusEl.textContent = this.loadError ? 'model unavailable' : 'loading model…';
      return;
    }

    // Kick an inference on the throttle (async, non-blocking).
    if (!this.busy && (this.frame++ % RUN_EVERY === 0)) this.infer(video, elemW, elemH);

    // Smooth toward the latest detection and draw every frame.
    const lerp = TRACK_LERP;
    if (this.det) {
      this.missCount = 0;
      if (!this.smooth) this.smooth = { ...this.det };
      else for (const k of ['x','y','w','h']) this.smooth[k] += (this.det[k] - this.smooth[k]) * lerp;
    } else if (this.smooth) {
      if (++this.missCount > 12) this.smooth = null; // dropped for a while → clear
    }
    if (this.statusEl) this.statusEl.textContent = this.det ? `potato found! (${this.det.score.toFixed(2)})` : 'searching…';
    if (this.smooth) this.drawAt(g, this.smooth.x, this.smooth.y, this.smooth.w, this.smooth.h);
  },

  // Draw the box + overlay graphic at an element-space rect (canvas is CSS-mirrored).
  drawAt(g, x, y, w, h) {
    g.save();
    g.strokeStyle = 'rgba(180, 235, 90, 0.95)';
    g.lineWidth = 3;
    g.strokeRect(x, y, w, h);
    g.restore();
    const img = this.overlay;
    const ready = img && (img.complete || (img.readyState !== undefined && img.readyState >= 2));
    if (ready) {
      const natW = img.naturalWidth ?? img.videoWidth, natH = img.naturalHeight ?? img.videoHeight;
      if (natW && natH) {
        const iw = w * 1.2, ih = iw * (natH / natW);
        const cx = x + w / 2, cy = y + h / 2;
        g.save(); g.scale(-1, 1);                 // un-flip the image on the mirrored canvas
        g.drawImage(img, -(cx + iw / 2), cy - ih / 2, iw, ih);
        g.restore();
      }
    } else {
      g.save(); g.scale(-1, 1);
      g.font = '18px Arial'; g.fillStyle = 'rgba(180, 235, 90, 0.95)';
      g.fillText('potato', -(x + w), y - 6);
      g.restore();
    }
  },

  async infer(video, elemW, elemH) {
    this.busy = true;
    try {
      const S = this.size;
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) { this.busy = false; return; }

      // Letterbox the full frame into S×S (preserve aspect, pad with black).
      const scale = Math.min(S / vw, S / vh);
      const nw = Math.round(vw * scale), nh = Math.round(vh * scale);
      const dx = Math.floor((S - nw) / 2), dy = Math.floor((S - nh) / 2);
      this.offCtx.fillStyle = '#000'; this.offCtx.fillRect(0, 0, S, S);
      this.offCtx.drawImage(video, 0, 0, vw, vh, dx, dy, nw, nh);

      // → CHW float32, RGB, 0..1
      const { data } = this.offCtx.getImageData(0, 0, S, S);
      const arr = new Float32Array(S * S * 3), area = S * S;
      for (let i = 0; i < area; i++) {
        arr[i]            = data[i * 4]     / 255;
        arr[area + i]     = data[i * 4 + 1] / 255;
        arr[2 * area + i] = data[i * 4 + 2] / 255;
      }
      const tensor = new this.ort.Tensor('float32', arr, [1, 3, S, S]);
      const out = await this.session.run({ [this.inputName]: tensor });
      const o = out[this.outputName];
      const d = o.data, dims = o.dims;
      // YOLOv8 output is [1, 4+nc, A] (channel-major) or [1, A, 4+nc] (anchor-major).
      // The channel count (4+nc) is the smaller axis; detect which one it is so we read
      // the right cells regardless of how the model was exported.
      const channelMajor = dims[1] <= dims[2];
      const C  = channelMajor ? dims[1] : dims[2];
      const A  = channelMajor ? dims[2] : dims[1];
      const nc = C - 4;
      const at = channelMajor ? (ch, a) => d[ch * A + a] : (ch, a) => d[a * C + ch];
      if (!this._loggedDims) {
        this._loggedDims = true;
        console.log(`[potato] output dims ${JSON.stringify(dims)} → ${nc} classes, ${A} anchors, ${channelMajor ? 'channel-major' : 'anchor-major'}`);
      }

      const conf = parseFloat(this.confEl?.value ?? 0.4);
      const cand = [];
      let maxRaw = 0, maxRawCls = -1;
      for (let a = 0; a < A; a++) {
        let best = -1, bc = -1;
        for (let c = 0; c < nc; c++) {
          if (nc === 7 && c === NOISE_IDX) continue; // skip "Noise" on the 7-class model
          const s = at(4 + c, a);
          if (s > best) { best = s; bc = c; }
        }
        if (best > maxRaw) { maxRaw = best; maxRawCls = bc; }
        if (best < conf) continue;
        const cx = at(0, a), cy = at(1, a), w = at(2, a), h = at(3, a);
        cand.push({ x: cx - w / 2, y: cy - h / 2, w, h, score: best, cls: bc });
      }
      // Periodic diagnostic (~1–2s) so you can see whether the model is firing and tune conf.
      this._diag = (this._diag || 0) + 1;
      if (this._diag % 15 === 0) {
        const name = (nc === 7 && maxRawCls >= 0) ? CLASS_NAMES[maxRawCls] : 'potato';
        console.log(`[potato] best score seen: ${maxRaw.toFixed(3)} (${name}) | conf=${conf} | boxes over conf: ${cand.length}`);
      }

      // Take the single strongest (one potato) after a light NMS pass.
      cand.sort((p, q) => q.score - p.score);
      let box = cand[0];
      if (box) {
        // Undo letterbox → video-frame coords, then cover-fit → element coords.
        const vx = (box.x - dx) / scale, vy = (box.y - dy) / scale;
        const vwid = box.w / scale, vhei = box.h / scale;
        const coverScale = Math.max(elemW / vw, elemH / vh);
        const cropX = (vw * coverScale - elemW) / 2, cropY = (vh * coverScale - elemH) / 2;
        const ex = vx * coverScale - cropX, ey = vy * coverScale - cropY;
        const ew = vwid * coverScale, eh = vhei * coverScale;
        this.det = { x: ex, y: ey, w: ew, h: eh, score: box.score };
      } else {
        this.det = null;
      }
      tensor.dispose();
    } catch (e) {
      console.warn('potato inference failed', e);
    }
    this.busy = false;
  },
};
