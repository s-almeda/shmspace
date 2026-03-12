import { encode, decode } from 'https://esm.sh/blurhash@2.0.5';

const ENCODE_INTERVAL = 150;

export function createBlurhashRenderer(bgCanvas, video) {
  let lastEncodeTime = 0;
  let rafId = null;

  const encodeCanvas = document.createElement('canvas');
  encodeCanvas.width = 64; encodeCanvas.height = 36;
  const encodeCtx = encodeCanvas.getContext('2d', { willReadFrequently: true });

  function sizeBgCanvas() {
    bgCanvas.width  = window.innerWidth;
    bgCanvas.height = window.innerHeight;
  }

  function renderBlurhash(hash) {
    const w = bgCanvas.width, h = bgCanvas.height;
    const decodeW = 128, decodeH = Math.round(128 * (h / w));
    const pixels = decode(hash, decodeW, decodeH, 1);
    const ctx = bgCanvas.getContext('2d');
    const imageData = ctx.createImageData(decodeW, decodeH);
    imageData.data.set(pixels);
    const tmp = document.createElement('canvas');
    tmp.width = decodeW; tmp.height = decodeH;
    tmp.getContext('2d').putImageData(imageData, 0, 0);
    ctx.drawImage(tmp, 0, 0, w, h);
  }

  function loop(timestamp) {
    rafId = requestAnimationFrame(loop);
    if (video.readyState < 2) return;
    if (timestamp - lastEncodeTime < ENCODE_INTERVAL) return;
    lastEncodeTime = timestamp;
    encodeCtx.drawImage(video, 0, 0, 64, 36);
    const pixels = encodeCtx.getImageData(0, 0, 64, 36);
    try {
      const hash = encode(pixels.data, 64, 36, 4, 3);
      renderBlurhash(hash);
      if (!bgCanvas.classList.contains('visible')) bgCanvas.classList.add('visible');
    } catch (e) { /* ignore encode errors */ }
  }

  sizeBgCanvas();
  window.addEventListener('resize', sizeBgCanvas);

  return {
    start() {
      if (rafId) cancelAnimationFrame(rafId);
      requestAnimationFrame(loop);
    }
  };
}