// ── Feature module: capture ───────────────────────────────────────────────
// "Teachable Machine for object detection", fully local. A target box jumps around
// the frame; you put the potato inside it and hit SPACE. Each capture saves the raw
// (un-mirrored) webcam frame AND an auto-generated YOLO label (the box), building a
// dataset with no manual annotation. The moving box gives positional variety so the
// model can localize the potato anywhere (needed to track a throw). A "train" button
// spawns a local Python script that finetunes YOLOv8 and exports potato_model/potato.onnx.
//
// Launch: /puppets?rig=capture   (local `node App.js` — saving/training are localhost-only)
//   SPACE — capture the current frame + label, then the box jumps to a new random spot
//   train button — kicks off local training; progress shows in the panel
//
// Coordinate note: the box is defined in RAW-frame normalized coords and drawn via the
// same raw→element (cover-fit) transform detection uses; the overlay canvas is CSS-mirrored
// like faceCanvas, so on-screen alignment ⇔ raw-frame alignment, and the label is just the
// raw-normalized box. No manual mirror math.

export default {
  id: 'capture',
  n: 0,
  video: null,
  canvas: null, g: null,
  target: null,     // current target box in raw-normalized center form {cx,cy,w,h}
  training: false,
  pollTimer: null,

  async loadModels(ctx) {
    this.video = ctx.video;
    this.canvas = ctx.createLayer('captureCanvas', { zIndex: 8 });
    this.canvas.style.transform = 'scaleX(-1)'; // match the mirrored webcam / faceCanvas
    this.g = this.canvas.getContext('2d');
    this.randomizeTarget();

    this.panel = ctx.registerPanelHTML(`
      <div class="field-row" style="flex-direction:column; align-items:stretch; gap:3px;">
        <b>📸 capture → train</b>
        <span style="font-size:11px;">put potato in the box, hit <b>SPACE</b> · <b>R</b> = reshape box</span>
        <span id="cap-count">saved: 0</span>
        <button id="cap-train" type="button" style="margin-top:2px;">train on captured frames</button>
        <span id="cap-train-status" style="font-size:11px; white-space:normal;"></span>
      </div>`);
    this.countEl  = this.panel.querySelector('#cap-count');
    this.statusEl = this.panel.querySelector('#cap-train-status');
    this.panel.querySelector('#cap-train').addEventListener('click', () => this.startTraining());

    document.addEventListener('keydown', (ev) => {
      if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA' || ev.target.isContentEditable) return;
      if (ev.code === 'Space' && !ev.repeat) { ev.preventDefault(); this.shoot(); }
      // 'r' re-rolls the box shape/position without saving (if it doesn't fit your potato).
      if (ev.key.toLowerCase() === 'r' && !ev.repeat) { ev.preventDefault(); this.randomizeTarget(); }
    });

    console.log('[capture] ready — SPACE to capture (box auto-labels). Saves to potato_model/dataset/');
  },

  randomizeTarget() {
    // A potato held up reads as portrait (taller than wide), so bias toward that — with
    // some landscape/square variety for tumbling mid-throw frames.
    const portrait = Math.random() < 0.75;
    let w, h;
    if (portrait) {
      w = 0.12 + Math.random() * 0.16;   // 0.12–0.28 (narrow)
      h = 0.24 + Math.random() * 0.22;   // 0.24–0.46 (tall)
    } else {
      w = 0.22 + Math.random() * 0.20;   // 0.22–0.42
      h = 0.14 + Math.random() * 0.14;   // 0.14–0.28
    }
    const cx = w / 2 + Math.random() * (1 - w);
    const cy = h / 2 + Math.random() * (1 - h);
    this.target = { cx, cy, w, h };
  },

  onFrame(video, ctx) {
    const g = this.g; if (!g) return;
    const rect = video.getBoundingClientRect();
    const dispW = rect.width, dispH = rect.height;
    if (this.canvas.width !== dispW)  this.canvas.width  = dispW;
    if (this.canvas.height !== dispH) this.canvas.height = dispH;
    g.clearRect(0, 0, dispW, dispH);
    if (video.readyState < 2 || !video.videoWidth) return;

    // raw-normalized target → raw px → element px (cover-fit), same as detection's toElem
    const vw = video.videoWidth, vh = video.videoHeight;
    const coverScale = Math.max(dispW / vw, dispH / vh);
    const cropX = (vw * coverScale - dispW) / 2, cropY = (vh * coverScale - dispH) / 2;
    const t = this.target;
    const rx = (t.cx - t.w / 2) * vw, ry = (t.cy - t.h / 2) * vh;
    const ex = rx * coverScale - cropX, ey = ry * coverScale - cropY;
    const ew = t.w * vw * coverScale, eh = t.h * vh * coverScale;

    g.save();
    g.strokeStyle = 'rgba(120, 220, 255, 0.95)';
    g.lineWidth = 3;
    g.setLineDash([10, 6]);
    g.strokeRect(ex, ey, ew, eh);
    g.restore();
    // label text (un-flip so it reads correctly on the mirrored canvas)
    g.save(); g.scale(-1, 1);
    g.font = '16px Arial'; g.fillStyle = 'rgba(120, 220, 255, 0.95)';
    g.fillText('put potato here and hit spacebar', -(ex + ew), ey - 6);
    g.fillText('press R to reroll box', -(ex + ew), ey + eh + 20);
    g.restore();
  },

  async shoot() {
    const v = this.video;
    if (!v || v.readyState < 2 || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);  // raw, un-mirrored — matches inference input
    const dataUrl = c.toDataURL('image/jpeg', 0.9);
    const t = this.target;
    // YOLO label: "<class> <cx> <cy> <w> <h>" normalized; single class 0 = potato.
    const label = `0 ${t.cx.toFixed(6)} ${t.cy.toFixed(6)} ${t.w.toFixed(6)} ${t.h.toFixed(6)}`;
    const filename = `potato_${Date.now()}_${String(this.n).padStart(4, '0')}`;
    try {
      const r = await fetch('/puppets/capture', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, dataUrl, label }),
      }).then(res => res.json());
      if (r?.ok) {
        this.n++;
        if (this.countEl) this.countEl.textContent = `saved: ${this.n}`;
        this.randomizeTarget();   // move the box for positional variety
      } else {
        console.warn('[capture] save failed', r);
      }
    } catch (e) { console.warn('[capture] save error', e); }
  },

  async startTraining() {
    if (this.training) return;
    if (this.n < 10) { if (this.statusEl) this.statusEl.textContent = 'capture more frames first (≥ ~40 ideal)'; return; }
    this.training = true;
    if (this.statusEl) this.statusEl.textContent = 'starting training…';
    try {
      const r = await fetch('/puppets/train', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imgsz: 480, epochs: 25 }),
      }).then(res => res.json());
      if (!r?.ok) {
        this.training = false;
        if (this.statusEl) this.statusEl.textContent = 'train error: ' + (r?.error || 'unknown');
        return;
      }
      this.pollTimer = setInterval(() => this.pollStatus(), 2000);
    } catch (e) {
      this.training = false;
      if (this.statusEl) this.statusEl.textContent = 'train request failed (is node App.js running?)';
    }
  },

  async pollStatus() {
    try {
      const s = await fetch('/puppets/train-status').then(r => r.json());
      if (this.statusEl) this.statusEl.textContent = s.running ? `training… ${s.tail || ''}` : (s.done ? '✅ done — reload ?rig=potatotest' : (s.error ? '❌ ' + s.error : (s.tail || '')));
      if (!s.running) { clearInterval(this.pollTimer); this.pollTimer = null; this.training = false; }
    } catch (e) { /* keep polling */ }
  },
};
