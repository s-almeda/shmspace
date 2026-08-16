// ── Feature module: drawing ───────────────────────────────────────────────
// Finger-paint with hand tracking. In drawing mode, when exactly ONE hand is up with a
// single index finger pointed up (others curled), it stamps circles at the fingertip and
// connects them with a smoothing line onto a persistent transparent layer. Drawing stops
// when the pose breaks OR a second hand appears.
//
// Test live:  /puppets?rig=draw   (toggle drawing mode, pick colour/size, clear)
// In a show:  a scene can set  "drawing": true/false  and  "drawingClear": true.
//
// The layer is CSS-mirrored like the webcam, so stamping at (landmark.x*W, landmark.y*H)
// lands exactly under your (mirrored) fingertip.

// Single index finger up: index tip clearly above its PIP, other three fingers curled.
function isPointing(h) {
  const indexUp   = h[8].y  < h[6].y - 0.02;
  const middleCur = h[12].y > h[10].y;
  const ringCur   = h[16].y > h[14].y;
  const pinkyCur  = h[20].y > h[18].y;
  return indexUp && middleCur && ringCur && pinkyCur;
}

// Open hand: all four fingers extended (each tip above its PIP).
function isOpenHand(h) {
  return h[8].y < h[6].y && h[12].y < h[10].y && h[16].y < h[14].y && h[20].y < h[18].y;
}

export default {
  id: 'drawing',
  canvas: null, g: null,
  enabled: false, color: '#b4dd1e', size: 6,
  lastPoint: null, clearedThisGesture: false,

  async loadModels(ctx) {
    // High z so strokes sit above the puppets/webcam. NOT cleared each frame (persistent).
    this.canvas = ctx.createLayer('drawCanvas', { zIndex: 9 });
    this.canvas.style.transform = 'scaleX(-1)'; // match mirrored webcam → stamp under finger
    this.g = this.canvas.getContext('2d');
    this.enabled = false;           // off until asked for; shows drive it per scene

    this.panel = ctx.registerPanelHTML(`
      <div class="field-row" style="flex-direction:column; align-items:stretch; gap:3px; min-width:0;">
        <b>🖌️ drawing</b>
        <span><input type="checkbox" id="draw-on" ${this.enabled ? 'checked' : ''}><label for="draw-on">drawing mode (d)</label></span>
        <label style="display:flex; gap:4px; align-items:center; min-width:0;">color
          <input type="color" id="draw-color" value="${this.color}"></label>
        <label style="display:flex; gap:4px; align-items:center; min-width:0;">size
          <input type="range" id="draw-size" min="2" max="30" step="1" value="${this.size}" style="flex:1; min-width:0;"></label>
        <button id="draw-clear" type="button" style="font-size:11px;">clear canvas</button>
        <span style="font-size:11px; color:#fff;">☝️ index up = draw · ✋✋ two open hands = clear</span>
      </div>`);
    const onEl = this.panel.querySelector('#draw-on');
    onEl.addEventListener('change', (e) => { this.enabled = e.target.checked; this.lastPoint = null; });
    this.panel.querySelector('#draw-color').addEventListener('input', (e) => { this.color = e.target.value; });
    this.panel.querySelector('#draw-size').addEventListener('input', (e) => { this.size = parseFloat(e.target.value); });
    this.panel.querySelector('#draw-clear').addEventListener('click', () => this.clear());

    document.addEventListener('keydown', (ev) => {
      if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA' || ev.target.isContentEditable) return;
      if (ev.key.toLowerCase() === 'd' && !ev.repeat) {
        this.enabled = !this.enabled; this.lastPoint = null;
        if (onEl) onEl.checked = this.enabled;
      }
    });
  },

  clear() {
    if (this.g) this.g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.lastPoint = null;
  },

  onScene(scene) {
    if (scene.drawing !== undefined) { this.enabled = !!scene.drawing; this.lastPoint = null; }
    if (scene.drawingColor) {
      this.color = scene.drawingColor;
      const el = this.panel?.querySelector('#draw-color'); if (el) el.value = scene.drawingColor;
    }
    if (scene.drawingClear) this.clear();
  },

  onFrame(video, ctx) {
    const g = this.g; if (!g) return;
    const rect = video.getBoundingClientRect();
    // Round to integers: canvas.width is an integer, but getBoundingClientRect is
    // fractional — comparing the two raw would be "different" every frame and resize
    // (which WIPES the canvas) constantly, so strokes never persist.
    const W = Math.round(rect.width), H = Math.round(rect.height);
    // Resize only on a real dimension change (rare); otherwise keep the accumulated drawing.
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }

    if (!this.enabled) { this.lastPoint = null; return; }

    const hands = ctx.handLandmarks;

    // Two open hands → clear the canvas (once per gesture; must drop the pose to re-trigger).
    if (hands && hands.length >= 2 && isOpenHand(hands[0]) && isOpenHand(hands[1])) {
      if (!this.clearedThisGesture) { this.clear(); this.clearedThisGesture = true; }
      this.lastPoint = null;
      return;
    }
    this.clearedThisGesture = false;

    // Need exactly one hand, in the pointing pose. Two hands (or wrong pose) → pause.
    if (!hands || hands.length !== 1 || !isPointing(hands[0])) { this.lastPoint = null; return; }

    const tip = hands[0][8];
    const x = tip.x * W, y = tip.y * H;
    g.strokeStyle = this.color; g.fillStyle = this.color;
    g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = this.size * 2;
    if (this.lastPoint) {                       // smoothing line between stamps
      g.beginPath();
      g.moveTo(this.lastPoint.x, this.lastPoint.y);
      g.lineTo(x, y);
      g.stroke();
    }
    g.beginPath();                              // circle stamp at the fingertip
    g.arc(x, y, this.size, 0, Math.PI * 2);
    g.fill();
    this.lastPoint = { x, y };
  },
};
