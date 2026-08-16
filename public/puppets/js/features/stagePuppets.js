// ── Feature module: stagePuppets ──────────────────────────────────────────
// Independent (off-hand) puppets drawn on their own NON-mirrored stage layer — placed
// at stage left / middle / right (or explicit x/y), moved with ease/teleport transitions,
// and optionally "pngtuber" animated: bounce up/down and/or swap between mouth
// open/closed frames driven by mic volume.
//
// Test live:  /puppets?rig=stagetest   (enable mic, upload frame(s), place, toggle)
// In a show, a scene's "stage" is the ABSOLUTE list of visible puppets:
//   "stage": [
//     { "id":"narrator", "image":"narrator_closed.png", "talkImage":"narrator_open.png",
//       "at":"left", "size":0.5, "pngtuber": { "bounce": true, "talk": true } }
//   ]
// Omit the key to persist puppets across a scene; use [] to clear. In SHOW MODE the panel
// grows per-puppet y/size/bounce sliders for live tuning, saved back via the edit button
// (localhost); freeplay gets the simpler "ventriloquy" controls instead.
// Images resolve from the show's stage/ folder (or an absolute /path).

const POS = { farleft: 0.10, left: 0.22, center: 0.5, middle: 0.5, right: 0.78, farright: 0.90 };
const DEFAULT_Y = 0.60;      // vertical anchor (fraction of stage height)
const BOUNCE_AMP = 0.07;     // per-puppet base bounce height (fraction of stage height)
const EASE_K = 0.15;         // per-frame lerp toward target (ease-out feel)

// Mic response. Speech RMS realistically lives in ~0.04–0.22, so the loudness is
// normalised across THAT window — the old code divided by the full 0–1 range, which
// left `over` peaking around 0.2 and made the bounce almost invisible.
const TALK_FLOOR = 0.04;     // RMS at or below this reads as silence
const TALK_CEIL  = 0.22;     // RMS of good loud speech — full bounce at this level
const MAX_GAIN   = 6;        // "mic sensitivity" full right = 6× a puppet's base height

function resolveX(at) {
  if (typeof at === 'number') return at;
  if (at && typeof at === 'object' && typeof at.x === 'number') return at.x;
  return POS[String(at).toLowerCase()] ?? 0.5;
}
function resolveY(at) {
  if (at && typeof at === 'object' && typeof at.y === 'number') return at.y;
  return DEFAULT_Y;
}

export default {
  id: 'stagePuppets',
  ctx: null, canvas: null, g: null,
  enabled: false,         // master on/off (panel checkbox) — off until the visitor asks
  puppets: new Map(),
  // audio
  analyser: null, timeData: null, audioReady: false, audioTrying: false,
  level: 0, threshold: 0.08,

  async loadModels(ctx) {
    this.ctx = ctx;
    this.canvas = ctx.createLayer('stageCanvas', { zIndex: 6 }); // NOT mirrored — real stage L/R
    this.g = this.canvas.getContext('2d');

    // Panel — "ventriloquy" to a visitor: an on switch, the puppet's two faces, where it
    // stands, and how loud you have to be. Bounce + mouth-swap are no longer options; a
    // ventriloquist dummy that doesn't move isn't the point. Show mode keeps the extra
    // per-puppet position/size sliders further down for authoring.
    this.panel = ctx.registerPanelHTML(`
      <div class="field-row" style="flex-direction:column; align-items:stretch; gap:3px; min-width:0;">
        <b>🎭 ventriloquy</b>
        <span><input type="checkbox" id="stage-on"><label for="stage-on">on?</label></span>
        <span id="stage-hint" style="font-size:10px; line-height:1.25; color:#5a5a4a; white-space:normal;"></span>
        <div id="stage-test-ui" style="min-width:0;">
          <div style="display:flex; gap:4px; margin-top:2px; flex-wrap:wrap;">
            <label class="upload-puppet-btn" style="flex:1 1 auto; min-width:0; font-size:11px;"><input type="file" id="stage-rest" accept="image/*" hidden>change resting face</label>
            <label class="upload-puppet-btn" style="flex:1 1 auto; min-width:0; font-size:11px;"><input type="file" id="stage-talk" accept="image/*" hidden>change talking face</label>
          </div>
          <div style="display:flex; gap:3px; margin-top:3px; flex-wrap:wrap;">
            <button id="stage-L" type="button" style="flex:1 1 auto; min-width:0; font-size:11px; padding:2px 3px;">◀ left</button>
            <button id="stage-M" type="button" style="flex:1 1 auto; min-width:0; font-size:11px; padding:2px 3px;">■ mid</button>
            <button id="stage-R" type="button" style="flex:1 1 auto; min-width:0; font-size:11px; padding:2px 3px;">right ▶</button>
          </div>
        </div>
        <div style="display:flex; gap:3px; align-items:center; flex-wrap:wrap; min-width:0; margin-top:2px;">
          <button id="stage-mic" type="button" style="font-size:11px; padding:2px 3px;">enable mic 🎤</button>
          <div style="flex:1 1 50px; min-width:40px; height:10px; background:#0003; border:1px solid #0005;">
            <div id="stage-meter" style="height:100%; width:0%; background:#6c6;"></div>
          </div>
        </div>
        <label style="display:flex; flex-direction:column; gap:1px; min-width:0;">mic sensitivity
          <input type="range" id="stage-thresh" min="0" max="1" step="0.01" value="0.55" style="width:100%; min-width:0;"></label>
        <div id="stage-controls" style="min-width:0;"></div>
      </div>`);

    this.meterEl   = this.panel.querySelector('#stage-meter');
    this.threshEl  = this.panel.querySelector('#stage-thresh');
    this.hintEl    = this.panel.querySelector('#stage-hint');
    this.controlsEl = this.panel.querySelector('#stage-controls');
    this.panel.querySelector('#stage-mic').addEventListener('click', () => this.initAudio());
    // Freeplay starts off (the visitor opts in); shows start ON, because there the puppet
    // list is driven entirely by each scene's "stage" key and nothing would re-enable it.
    this.enabled = ctx.isShowMode;
    this.onEl = this.panel.querySelector('#stage-on');
    this.onEl.checked = this.enabled;
    this.onEl.addEventListener('change', (e) => { this.enabled = e.target.checked; this.updateHint(); });

    // Expose current stage state so the edit/save button can persist it into the scene.
    ctx.getStagePuppets = () => this.serialize();

    // Freeplay drives a single 'test' puppet; bounce + mouth animation are always on.
    if (!ctx.isShowMode) {
      this.applySpec('test', { at: 'center', size: 0.5, pngtuber: { bounce: true, talk: true } }, ctx);
      this.panel.querySelector('#stage-L').addEventListener('click', () => this.move({ id: 'test', to: 'left' }));
      this.panel.querySelector('#stage-M').addEventListener('click', () => this.move({ id: 'test', to: 'center' }));
      this.panel.querySelector('#stage-R').addEventListener('click', () => this.move({ id: 'test', to: 'right' }));
      this.wireUpload('#stage-rest', 0);
      this.wireUpload('#stage-talk', 1);
    } else {
      this.panel.querySelector('#stage-test-ui').style.display = 'none';
    }
    this.updateHint();
    this.renderControls();
  },

  // One line of guidance under the on-switch: the mic is a second, separate permission
  // prompt from the camera, so people turn ventriloquy on and wonder why nothing moves.
  updateHint() {
    if (!this.hintEl) return;
    this.hintEl.textContent =
      !this.enabled  ? 'lip-sync a puppet to your voice.'
      : !this.audioReady ? 'enable mic access below to control the puppet with your voice'
      : 'make some noise';
  },

  wireUpload(sel, slot) {
    this.panel.querySelector(sel).addEventListener('change', (e) => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = (ev) => { const img = new Image(); img.onload = () => { const p = this.puppets.get('test'); if (p) p.images[slot] = img; }; img.src = ev.target.result; };
      r.readAsDataURL(f);
    });
  },

  async initAudio() {
    if (this.audioReady || this.audioTrying) return;
    this.audioTrying = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AC = window.AudioContext || window.webkitAudioContext;
      this.actx = new AC();
      const src = this.actx.createMediaStreamSource(stream);
      this.analyser = this.actx.createAnalyser();
      this.analyser.fftSize = 512;
      src.connect(this.analyser);
      this.timeData = new Uint8Array(this.analyser.fftSize);
      this.audioReady = true;
      const btn = this.panel?.querySelector('#stage-mic');
      if (btn) { btn.textContent = 'mic on ✓'; btn.disabled = true; }
      this.updateHint();
    } catch (e) {
      console.warn('[stage] mic denied/unavailable', e);
      if (this.hintEl) this.hintEl.textContent = 'mic access was blocked — check your browser’s site permissions.';
    }
    this.audioTrying = false;
  },

  readLevel() {
    if (!this.audioReady) return 0;
    this.analyser.getByteTimeDomainData(this.timeData);
    let sum = 0;
    for (let i = 0; i < this.timeData.length; i++) { const v = (this.timeData[i] - 128) / 128; sum += v * v; }
    return Math.sqrt(sum / this.timeData.length); // ~0 (silence) .. ~0.3 (loud speech)
  },

  // ── Scene state (ABSOLUTE) ──────────────────────────────────────────
  // A scene's "stage" is the full list of puppets visible in that scene:
  //   "stage": [ { "id":"sock", "image":"…", "talkImage":"…", "at":"left"|{x,y},
  //               "size":0.5, "pngtuber":{ "bounce":true, "talk":true } }, … ]
  // Omitting the "stage" key leaves puppets unchanged (persist); an empty array clears
  // them. Absolute (not delta) so it round-trips cleanly through the edit/save button.
  onScene(scene, ctx) {
    if (!Array.isArray(scene.stage)) return;      // key absent → persist unchanged
    const wanted = new Map(scene.stage.map(s => [s.id, s]));
    for (const id of [...this.puppets.keys()]) if (!wanted.has(id)) this.puppets.delete(id);
    for (const [id, spec] of wanted) this.applySpec(id, spec, ctx);
    this.renderControls();
  },

  applySpec(id, spec, ctx) {
    const x = resolveX(spec.at), y = resolveY(spec.at);
    const imageName = spec.image || null, talkName = spec.talkImage || null;
    let p = this.puppets.get(id);
    if (!p || p.imageName !== imageName || p.talkName !== talkName) {
      const images = [];
      if (imageName) images[0] = this.resolveImage(imageName, ctx);
      if (talkName)  images[1] = this.resolveImage(talkName, ctx);
      p = { images, x, y, tx: x, ty: y, bounce: 0, frame: 0, imageName, talkName };
      this.puppets.set(id, p);
    } else if (spec.transition === 'ease') {
      p.tx = x; p.ty = y;                          // glide from current
    } else {
      p.tx = x; p.ty = y; p.x = x; p.y = y;        // snap
    }
    p.size = spec.size ?? p.size ?? 0.5;
    p.bounceAmp = spec.pngtuber?.bounceHeight ?? p.bounceAmp ?? BOUNCE_AMP;
    p.pngtuber = { bounce: !!(spec.pngtuber?.bounce), talk: !!(spec.pngtuber?.talk) };
  },

  move(cmd) {   // freeplay L / M / R buttons — ease to a new position
    const p = this.puppets.get(cmd.id); if (!p) return;
    if (cmd.to !== undefined) { p.tx = resolveX(cmd.to); p.ty = resolveY(cmd.to); }
    p.teleport = cmd.transition === 'teleport';
  },

  resolveImage(name, ctx) {
    if (!ctx) return null;
    const src = name.startsWith('/') ? name : `/puppets/shows/${ctx.showName}/stage/${name}`;
    return ctx.makeMediaEl(src);
  },

  // Absolute serialization of current puppets — what the edit/save button writes to scene.stage.
  serialize() {
    return [...this.puppets].map(([id, p]) => ({
      id,
      ...(p.imageName ? { image: p.imageName } : {}),
      ...(p.talkName ? { talkImage: p.talkName } : {}),
      at: { x: +p.tx.toFixed(3), y: +p.ty.toFixed(3) },
      size: +(+p.size).toFixed(3),
      pngtuber: { bounce: p.pngtuber.bounce, talk: p.pngtuber.talk, bounceHeight: +(+p.bounceAmp).toFixed(3) },
    }));
  },

  // Per-puppet y / size / bounce sliders — SHOW MODE ONLY. These are authoring controls
  // (their values feed serialize() and the edit-mode save button); in freeplay they're
  // just clutter, so the demo gets left/mid/right and nothing else.
  renderControls() {
    const el = this.controlsEl; if (!el) return;
    el.innerHTML = '';
    if (!this.ctx?.isShowMode) return;
    if (!this.puppets.size) { el.innerHTML = '<span style="font-size:11px; color:#777;">(no stage puppets)</span>'; return; }
    for (const [id, p] of this.puppets) {
      const row = document.createElement('div');
      row.style.cssText = 'border-top:1px solid #cbb; margin-top:3px; padding-top:2px;';
      row.innerHTML =
        `<div style="font-size:11px;"><b>${id}</b></div>` +
        `<label style="display:flex; gap:4px; align-items:center; min-width:0; font-size:11px;">y<input type="range" class="sp-y" min="0.05" max="0.95" step="0.01" style="flex:1; min-width:0;"></label>` +
        `<label style="display:flex; gap:4px; align-items:center; min-width:0; font-size:11px;">size<input type="range" class="sp-sz" min="0.1" max="1" step="0.02" style="flex:1; min-width:0;"></label>` +
        `<label style="display:flex; gap:4px; align-items:center; min-width:0; font-size:11px;">bounce<input type="range" class="sp-bh" min="0" max="1" step="0.02" style="flex:1; min-width:0;"></label>`;
      const yEl = row.querySelector('.sp-y'), szEl = row.querySelector('.sp-sz'), bhEl = row.querySelector('.sp-bh');
      yEl.value = p.ty; szEl.value = p.size; bhEl.value = p.bounceAmp;
      yEl.addEventListener('input', () => { p.ty = parseFloat(yEl.value); p.y = p.ty; });
      szEl.addEventListener('input', () => { p.size = parseFloat(szEl.value); });
      bhEl.addEventListener('input', () => { p.bounceAmp = parseFloat(bhEl.value); });
      el.appendChild(row);
    }
  },

  // ── Render ──────────────────────────────────────────────────────────
  onFrame(video, ctx) {
    const g = this.g; if (!g) return;
    const rect = video.getBoundingClientRect();
    const W = rect.width, H = rect.height;
    if (this.canvas.width !== W)  this.canvas.width  = W;
    if (this.canvas.height !== H) this.canvas.height = H;
    g.clearRect(0, 0, W, H);

    // Master toggle — cleared above, so unchecking hides every puppet immediately.
    if (!this.enabled) return;

    // "mic sensitivity" is a bounce GAIN: hard left = dead still, hard right = very bouncy.
    const gain = parseFloat(this.threshEl?.value ?? 0.55) * MAX_GAIN;
    const raw = this.readLevel();
    this.level += (raw - this.level) * 0.5;                 // smooth the meter/level a touch
    if (this.meterEl) this.meterEl.style.width = Math.min(100, (this.level / TALK_CEIL) * 100) + '%';
    const over = Math.max(0, Math.min(1, (this.level - TALK_FLOOR) / (TALK_CEIL - TALK_FLOOR)));
    // Mouth swap keys off the fixed floor, not the gain — turning the bounce down to zero
    // shouldn't also freeze the puppet's mouth.
    const talking = this.level > TALK_FLOOR;

    for (const p of this.puppets.values()) {
      // ease (or snap) toward target position
      const k = p.teleport ? 1 : EASE_K;
      p.x += (p.tx - p.x) * k;
      p.y += (p.ty - p.y) * k;
      // bounce up while loud (pngtuber)
      const targetBounce = p.pngtuber.bounce ? -over * (p.bounceAmp ?? BOUNCE_AMP) * gain : 0;
      p.bounce += (targetBounce - p.bounce) * 0.45;   // snappy attack so it reads as a hop
      // mouth frame
      p.frame = (p.pngtuber.talk && p.images[1] && talking) ? 1 : 0;

      const img = p.images[p.frame] || p.images[0];
      const cx = p.x * W;
      const cy = (p.y + p.bounce) * H;
      const drawH = p.size * H;
      const ready = img && (img.complete || (img.readyState !== undefined && img.readyState >= 2)) && (img.naturalWidth || img.videoWidth);
      if (ready) {
        const natW = img.naturalWidth ?? img.videoWidth, natH = img.naturalHeight ?? img.videoHeight;
        const drawW = drawH * (natW / natH);
        g.drawImage(img, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
      } else {
        // placeholder so position/bounce are visible before art is loaded
        g.save();
        g.font = `${Math.round(drawH * 0.8)}px serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.globalAlpha = 0.9;
        g.fillText(talking ? '😮' : '🙂', cx, cy);
        g.restore();
      }
    }
  },
};
