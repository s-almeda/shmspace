// ── Feature module: faceId ────────────────────────────────────────────────
// Recognizes ALL faces in frame against the enrolled roster (face_ids/roster.json) and
// exposes a per-face { label, color } lookup that the bbox feature uses to label each
// box with the person's name in their assigned color (replacing the generic "face"
// label). Enroll people with ?rig=enroll; edit names/colors at /puppets/roster_editor.html.
//
// Roster entry: { "label": "shm", "name": "shm garanganao almeda", "color": "#90bd42",
//                 "descriptors": [[128…], …] }  (name + color optional)
//
// People are added by hand: enroll locally with ?rig=enroll (or paste a descriptor array
// in), set their name/colour, and commit face_ids/roster.json. Only add people who've
// agreed to it — the file is world-readable on the live site. There is no way to edit the
// deployed roster from a browser; the write routes are localhost-only AND prod has no
// server at all, so the roster is read-only in public by construction.

const WEIGHTS = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights';
const DEFAULT_COLOR  = '#78c8ff';
const UNKNOWN_COLOR  = '#dddddd';

export default {
  id: 'faceId',
  faceapi: null, video: null,
  matcher: null, roster: [], byLabel: {},
  threshold: 0.55,       // match strictness — fixed; the slider was panel clutter for a demo
  ready: false,          // recognition net + roster loaded (see initModel)
  identities: [], busy: false, last: 0,
  active: true,          // recognition on/off (off = box shows the descriptive race/age/… label)
  labelOverride: null,   // per-scene { label: "display name" } override (e.g. VALIANT HERO)

  // Panel goes up immediately; the recognition net (~6MB) and roster load in the
  // background, same as the potato model. The checkbox stays disabled until both land.
  async loadModels(ctx) {
    this.faceapi = ctx.faceapi;
    this.video = ctx.video;
    this.active = false;   // off until asked for — in shows a scene sets "faceId": true

    this.panel = ctx.registerPanelHTML(`
      <div class="field-row" style="flex-direction:column; align-items:stretch; gap:3px;">
        <div style="display:flex; justify-content:space-between;"><b>🧑 face id</b><span id="faceid-status">…</span></div>
        <span><input type="checkbox" id="faceid-on"><label for="faceid-on">recognize faces</label></span>
      </div>`);
    this.statusEl = this.panel.querySelector('#faceid-status');
    this.onEl = this.panel.querySelector('#faceid-on');
    this.onEl.checked  = this.active;
    this.onEl.disabled = true;
    this.onEl.addEventListener('change', (e) => { this.active = e.target.checked; });

    // Expose a per-face identity lookup for the bbox label (element-space box → {label,color}).
    ctx.identifyFace = (box) => this.identify(box);

    this.initModel();   // deliberately not awaited
  },

  async initModel() {
    if (this.statusEl) this.statusEl.textContent = 'loading…';
    try {
      const [, roster] = await Promise.all([
        this.faceapi.nets.faceRecognitionNet.loadFromUri(WEIGHTS),
        fetch('/puppets/face_ids/roster.json').then(r => r.ok ? r.json() : []).catch(() => []),
      ]);
      this.buildMatcher(roster);
      this.ready = true;
      if (this.onEl) this.onEl.disabled = false;
      if (this.statusEl) this.statusEl.textContent = this.matcher ? 'ready' : 'roster empty — enroll first';
      console.log(`[faceId] ready — ${this.roster.length} enrolled: ${this.roster.map(p => p.label).join(', ')}`);
    } catch (e) {
      if (this.statusEl) this.statusEl.textContent = 'unavailable';
      console.warn('[faceId] failed to load', e);
    }
  },

  buildMatcher(roster) {
    this.roster = Array.isArray(roster) ? roster : [];
    this.byLabel = {};
    this.roster.forEach(p => { this.byLabel[p.label] = p; });
    const labeled = this.roster
      .filter(p => p.descriptors && p.descriptors.length)
      .map(p => new this.faceapi.LabeledFaceDescriptors(p.label, p.descriptors.map(d => Float32Array.from(d))));
    this.matcher = labeled.length ? new this.faceapi.FaceMatcher(labeled, this.threshold) : null;
  },

  // A scene may relabel recognized people (e.g. { "faceLabels": { "shm": "VALIANT HERO" } }).
  onScene(scene) {
    this.labelOverride = (scene.faceLabels && typeof scene.faceLabels === 'object') ? scene.faceLabels : null;
    if (scene.faceId !== undefined) { this.active = !!scene.faceId; if (this.onEl) this.onEl.checked = this.active; }
  },

  // Called each detectFace (~100ms); throttle our own all-faces recognition pass.
  onFace(results, ctx) {
    if (!this.ready) return;              // still loading — leave the status text alone
    if (!this.active) {
      this.identities = [];
      if (this.statusEl) this.statusEl.textContent = '';
      return;
    }
    const now = performance.now();
    if (this.busy || now - this.last < 400) return;
    this.last = now;
    this.recognize();
  },

  async recognize() {
    if (!this.matcher) { this.identities = []; return; }
    this.busy = true;
    try {
      const v = this.video;
      const rect = v.getBoundingClientRect();
      const elemW = rect.width, elemH = rect.height;
      const vw = v.videoWidth || elemW, vh = v.videoHeight || elemH;
      const coverScale = Math.max(elemW / vw, elemH / vh);
      const cropX = (vw * coverScale - elemW) / 2, cropY = (vh * coverScale - elemH) / 2;
      const toElem = (x, y) => ({ x: x * coverScale - cropX, y: y * coverScale - cropY });

      const dets = await this.faceapi
        .detectAllFaces(v, new this.faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks(true).withFaceDescriptors();

      this.identities = dets.map(d => {
        const m = this.matcher.findBestMatch(d.descriptor);
        const unknown = m.label === 'unknown';
        const person = this.byLabel[m.label];
        const b = d.detection.box;
        const c = toElem(b.x + b.width / 2, b.y + b.height / 2);
        const override = this.labelOverride && this.labelOverride[m.label];
        return {
          cx: c.x, cy: c.y, distance: m.distance,
          display: override || (unknown ? 'someone' : (person?.name || m.label)),
          color: unknown ? UNKNOWN_COLOR : (person?.color || (m.label === 'shm' ? '#90bd42' : DEFAULT_COLOR)),
        };
      });

      if (this.statusEl) this.statusEl.textContent = this.identities.length
        ? this.identities.map(i => `${i.display} ${i.distance.toFixed(2)}`).join(', ')
        : 'no face';
    } catch (e) { /* transient tfjs contention — ignore */ }
    this.busy = false;
  },

  // Element-space box → nearest recognized identity whose center falls inside it.
  identify(box) {
    if (!this.active || !this.identities.length) return null;
    let best = null, bestD = Infinity;
    const bcx = box.x + box.w / 2, bcy = box.y + box.h / 2;
    for (const id of this.identities) {
      if (id.cx >= box.x && id.cx <= box.x + box.w && id.cy >= box.y && id.cy <= box.y + box.h) {
        const d = Math.hypot(id.cx - bcx, id.cy - bcy);
        if (d < bestD) { bestD = d; best = id; }
      }
    }
    return best ? { label: best.display, color: best.color } : null;
  },
};
