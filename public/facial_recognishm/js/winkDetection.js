import { LEFT_EYE, RIGHT_EYE, EAR_THRESHOLD, WINK_COOLDOWN } from './constants.js';

let lastWinkTime = 0;

function eyeAspectRatio(points) {
  const v1 = Math.hypot(points[1].x - points[5].x, points[1].y - points[5].y);
  const v2 = Math.hypot(points[2].x - points[4].x, points[2].y - points[4].y);
  const h  = Math.hypot(points[0].x - points[3].x, points[0].y - points[3].y);
  return (v1 + v2) / (2.0 * h);
}

export function detectWink(landmarks) {
  const pts = landmarks.positions;
  const leftEAR  = eyeAspectRatio(LEFT_EYE.map(i => pts[i]));
  const rightEAR = eyeAspectRatio(RIGHT_EYE.map(i => pts[i]));
  const now = Date.now();
  if (now - lastWinkTime < WINK_COOLDOWN) return null;
  const leftClosed  = leftEAR  < EAR_THRESHOLD;
  const rightClosed = rightEAR < EAR_THRESHOLD;
  if (leftClosed && !rightClosed) { lastWinkTime = now; return 'left'; }
  if (rightClosed && !leftClosed) { lastWinkTime = now; return 'right'; }
  return null;
}