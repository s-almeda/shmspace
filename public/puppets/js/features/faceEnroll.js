// ── Feature module: faceEnroll ────────────────────────────────────────────
// In-browser face enrollment (like the potato capture tool, but for identities). Uses
// face-api's recognition net to compute a 128-d descriptor from the current frame and
// appends it to face_ids/roster.json via a localhost-only route. Enroll a few samples
// per person (varied angle/expression) for robust matching. The faceId module then
// recognizes faces against this roster.
//
// Launch: /puppets?rig=enroll   (local node App.js — saving is localhost-only)
//   type a name, then press E (or the button) a few times per person.

const WEIGHTS = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights';

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });
}

export default {
  id: 'faceEnroll',
  faceapi: null, video: null, busy: false, counts: {},

  async loadModels(ctx) {
    this.faceapi = ctx.faceapi;
    this.video = ctx.video;
    await this.faceapi.nets.faceRecognitionNet.loadFromUri(WEIGHTS);

    const roster = await fetch('/puppets/face_ids/roster.json').then(r => r.ok ? r.json() : []).catch(() => []);
    (roster || []).forEach(p => { this.counts[p.label] = (p.descriptors || []).length; });

    this.panel = ctx.registerPanelHTML(`
      <div class="field-row" style="flex-direction:column; align-items:stretch; gap:3px;">
        <b>🧑 enroll face</b>
        <input id="enroll-name" type="text" value="shm" placeholder="name" style="width:100%;">
        <button id="enroll-shot" type="button">capture sample (E)</button>
        <button id="enroll-folder" type="button">add from refs/&lt;name&gt;/ folder</button>
        <button id="enroll-clear" type="button">clear this name</button>
        <span id="enroll-status" style="font-size:11px; white-space:normal;"></span>
      </div>`);
    this.nameEl   = this.panel.querySelector('#enroll-name');
    this.statusEl = this.panel.querySelector('#enroll-status');
    this.panel.querySelector('#enroll-shot').addEventListener('click', () => this.enroll());
    this.panel.querySelector('#enroll-folder').addEventListener('click', () => this.enrollFolder());
    this.panel.querySelector('#enroll-clear').addEventListener('click', () => this.clear());
    this.nameEl.addEventListener('input', () => this.updateStatus());

    document.addEventListener('keydown', (ev) => {
      if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA' || ev.target.isContentEditable) return;
      if (ev.key.toLowerCase() === 'e' && !ev.repeat) { ev.preventDefault(); this.enroll(); }
    });
    this.updateStatus('recognition net ready');
  },

  currentLabel() { return (this.nameEl?.value || '').trim(); },

  updateStatus(msg) {
    const label = this.currentLabel() || '(no name)';
    const c = this.counts[label] || 0;
    if (this.statusEl) this.statusEl.textContent = (msg ? msg + ' · ' : '') + `${label}: ${c} samples`;
  },

  async enroll() {
    if (this.busy) return;
    const v = this.video;
    if (!v || v.readyState < 2) { this.updateStatus('camera not ready'); return; }
    const label = this.currentLabel();
    if (!label) { this.updateStatus('enter a name first'); return; }
    if (!/^[A-Za-z0-9._-]+$/.test(label)) { this.updateStatus('name: letters/numbers/._- only'); return; }
    this.busy = true; this.updateStatus('capturing…');
    try {
      const det = await this.faceapi
        .detectSingleFace(v, new this.faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks(true).withFaceDescriptor();
      if (!det) { this.busy = false; this.updateStatus('no face detected — face the camera'); return; }
      const descriptor = Array.from(det.descriptor);
      const r = await fetch('/puppets/roster', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, descriptor }),
      }).then(x => x.json());
      if (r?.ok) { this.counts[label] = r.count; this.updateStatus('saved ✓'); }
      else this.updateStatus('save failed: ' + (r?.error || ''));
    } catch (e) { this.updateStatus('error: ' + e.message); }
    this.busy = false;
  },

  // Enroll every photo in face_ids/refs/<name>/ (drop a folder of e.g. Max photos there).
  // Runs face-api on each image in the browser and appends each descriptor to the roster.
  async enrollFolder() {
    if (this.busy) return;
    const label = this.currentLabel();
    if (!label) { this.updateStatus('enter a name first'); return; }
    this.busy = true;
    this.updateStatus(`reading refs/${label}/…`);
    const files = await fetch(`/puppets/roster-refs/${label}`).then(r => r.json()).catch(() => []);
    if (!files.length) { this.busy = false; this.updateStatus(`no photos in face_ids/refs/${label}/`); return; }
    let added = 0, noFace = 0;
    for (let i = 0; i < files.length; i++) {
      this.updateStatus(`folder ${i + 1}/${files.length} (+${added})`);
      let img;
      try { img = await loadImage(`/puppets/face_ids/refs/${label}/${files[i]}`); } catch (e) { continue; }
      try {
        const det = await this.faceapi
          .detectSingleFace(img, new this.faceapi.TinyFaceDetectorOptions({ inputSize: 512 }))
          .withFaceLandmarks(true).withFaceDescriptor();
        if (!det) { noFace++; continue; }
        const r = await fetch('/puppets/roster', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label, descriptor: Array.from(det.descriptor) }),
        }).then(x => x.json());
        if (r?.ok) { added++; this.counts[label] = r.count; }
      } catch (e) { /* skip bad image */ }
    }
    this.busy = false;
    this.updateStatus(`folder done: +${added} added, ${noFace} no-face`);
  },

  async clear() {
    const label = this.currentLabel();
    if (!label) return;
    try {
      const r = await fetch('/puppets/roster', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, clear: true }),
      }).then(x => x.json());
      if (r?.ok) { this.counts[label] = 0; this.updateStatus('cleared'); }
    } catch (e) { this.updateStatus('clear failed'); }
  },
};
