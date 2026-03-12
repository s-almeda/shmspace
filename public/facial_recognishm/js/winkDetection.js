import { LEFT_EYE, RIGHT_EYE, WINK_COOLDOWN } from './constants.js';

const EAR_CLOSED     = 0.13;  // closed eye must be below this
const EAR_OPEN       = 0.23;  // other eye must be above this (blink filter)
const FRAMES_NEEDED  = 4;     // ~400ms of sustained wink at 100ms interval

let lastWinkTime      = 0;
let leftClosedFrames  = 0;
let rightClosedFrames = 0;

function eyeAspectRatio(points) {
  const v1 = Math.hypot(points[1].x - points[5].x, points[1].y - points[5].y);
  const v2 = Math.hypot(points[2].x - points[4].x, points[2].y - points[4].y);
  const h  = Math.hypot(points[0].x - points[3].x, points[0].y - points[3].y);
  return (v1 + v2) / (2.0 * h);
}

export function detectWink(landmarks) {
  const pts  = landmarks.positions;
  const earL = eyeAspectRatio(LEFT_EYE.map(i => pts[i]));
  const earR = eyeAspectRatio(RIGHT_EYE.map(i => pts[i]));

  console.log(`EAR L:${earL.toFixed(3)} R:${earR.toFixed(3)}`);

  // Wink = one eye shut AND the other eye clearly open
  const leftWinking  = earL < EAR_CLOSED && earR > EAR_OPEN;
  const rightWinking = earR < EAR_CLOSED && earL > EAR_OPEN;

  leftClosedFrames  = leftWinking  ? leftClosedFrames  + 1 : 0;
  rightClosedFrames = rightWinking ? rightClosedFrames + 1 : 0;

  const now = Date.now();
  if (now - lastWinkTime < WINK_COOLDOWN) return null;

  if (leftClosedFrames >= FRAMES_NEEDED) {
    leftClosedFrames = 0;
    lastWinkTime = now;
    return 'left';
  }
  if (rightClosedFrames >= FRAMES_NEEDED) {
    rightClosedFrames = 0;
    lastWinkTime = now;
    return 'right';
  }

  return null;
}
