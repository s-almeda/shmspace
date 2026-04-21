#!/usr/bin/env node
/*
 * convert_gifs.js
 *
 * Converts every .gif under public/puppets/ into a VP9 .webm with alpha,
 * so the puppet rig can route them through its <video> path instead of
 * the <img> path (Chrome pauses detached <img>-backed GIFs).
 *
 * Behavior:
 *   - Scans public/puppets/ recursively for *.gif
 *   - Skips files where a sibling .webm already exists and is newer
 *   - Invokes ffmpeg with VP9 + yuva420p for alpha preservation
 *   - On success, renames the original .gif → .gif.bak (so the puppet
 *     list endpoint's extension regex stops seeing it, keeping indices
 *     stable), leaving a recoverable backup
 *   - Prefers /opt/homebrew/bin/ffmpeg (libvpx-vp9 available) over
 *     whatever ffmpeg is on $PATH, since macOS users may have the
 *     Krita-bundled ffmpeg which lacks VP9
 *
 * Usage:
 *   node scripts/convert_gifs.js
 */

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const SCAN_ROOT = path.join(REPO_ROOT, 'public', 'puppets');

// ── Locate an ffmpeg binary that has libvpx-vp9 ──────────────────────
function findFfmpeg() {
  const candidates = [
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
  ];
  // Also consider whatever's on PATH, but check it last so a broken
  // bundled ffmpeg (e.g. Krita's) doesn't win.
  try {
    const which = execFileSync('which', ['ffmpeg'], { encoding: 'utf8' }).trim();
    if (which && !candidates.includes(which)) candidates.push(which);
  } catch (_) { /* no ffmpeg on PATH, fine */ }

  for (const bin of candidates) {
    if (!bin || !fs.existsSync(bin)) continue;
    const probe = spawnSync(bin, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
    if (probe.status === 0 && /libvpx-vp9/.test(probe.stdout)) {
      return bin;
    }
  }
  return null;
}

const FFMPEG = findFfmpeg();
if (!FFMPEG) {
  console.error('ERROR: could not find an ffmpeg build with libvpx-vp9 support.');
  console.error('Install via Homebrew:  brew install ffmpeg');
  console.error('(macOS users: the ffmpeg bundled with Krita lacks VP9 and cannot be used.)');
  process.exit(1);
}
console.log(`[convert] using ffmpeg: ${FFMPEG}`);

// ── Recursively find every .gif under SCAN_ROOT ─────────────────────
function findGifs(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      findGifs(full, out);
    } else if (e.isFile() && /\.gif$/i.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

const gifs = findGifs(SCAN_ROOT);
if (!gifs.length) {
  console.log('[convert] no .gif files found under public/puppets/');
  process.exit(0);
}
console.log(`[convert] found ${gifs.length} gif file(s)`);

// ── Convert each one ─────────────────────────────────────────────────
let converted = 0, skipped = 0, failed = 0;
for (const gif of gifs) {
  const rel    = path.relative(REPO_ROOT, gif);
  const stem   = gif.replace(/\.gif$/i, '');
  const webm   = `${stem}.webm`;
  const backup = `${gif}.bak`;

  // Skip if a newer .webm already exists
  if (fs.existsSync(webm)) {
    const gifMtime  = fs.statSync(gif).mtimeMs;
    const webmMtime = fs.statSync(webm).mtimeMs;
    if (webmMtime >= gifMtime) {
      console.log(`[skip] ${rel}  (webm already up-to-date)`);
      skipped++;
      // Still rename the .gif to .gif.bak so the rig doesn't double-list it
      if (!fs.existsSync(backup)) {
        fs.renameSync(gif, backup);
        console.log(`[skip]   → renamed original to ${path.basename(backup)}`);
      }
      continue;
    }
  }

  // Run ffmpeg
  const t0 = Date.now();
  const args = [
    '-y',
    '-i', gif,
    '-c:v', 'libvpx-vp9',
    '-pix_fmt', 'yuva420p',
    '-auto-alt-ref', '0',  // required for VP9 with alpha
    '-b:v', '0',
    '-crf', '30',
    '-an',
    webm,
  ];
  const res = spawnSync(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
  const dt = ((Date.now() - t0) / 1000).toFixed(1);

  if (res.status !== 0) {
    console.error(`[FAIL] ${rel}  (ffmpeg exit ${res.status})`);
    if (res.stderr) {
      const tail = res.stderr.split('\n').slice(-6).join('\n');
      console.error(tail);
    }
    failed++;
    continue;
  }

  // Rename original to .gif.bak so the puppet list endpoint stops seeing it
  fs.renameSync(gif, backup);
  console.log(`[ok]   ${rel}  →  ${path.basename(webm)}  (${dt}s)`);
  converted++;
}

console.log('');
console.log(`[convert] done — ${converted} converted, ${skipped} skipped, ${failed} failed`);
if (converted > 0) {
  console.log('[convert] original .gif files were renamed to .gif.bak as a rollback safety net.');
  console.log('[convert] once you verify the .webm output, you can delete the .bak files.');
}
process.exit(failed > 0 ? 1 : 0);
