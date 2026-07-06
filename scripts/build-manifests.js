/*
build-manifests.js — generate the static directory-listing JSON that used to be
served dynamically by App.js / public/puppets/puppet_routes.js.

Vercel now serves the site as static files (no serverless function), so these
listings are baked at build time instead of read from disk per request. They
only change when media is added/removed, which happens at deploy time anyway.

Run by Vercel via `buildCommand` (see vercel.json) and safe to run locally.
The output URLs match what the frontend already fetches, via rewrites in
vercel.json:
    /facial_recognishm/puppets-list          -> facial_recognishm/puppets-list.json
    /puppets/collections                     -> puppets/collections.json
    /puppets/hand-puppets-list/<collection>  -> puppets/hand-puppets-list/<c>.json
    /puppets/head-puppets-list/<collection>  -> puppets/head-puppets-list/<c>.json

Frontend consumers all do `.then(r => r.json())`, so static JSON is a drop-in.
*/

const fs = require('fs');
const path = require('path');

const publicPath = path.join(__dirname, '..', 'public');

// Same media matcher the old endpoints used.
const MEDIA_RE = /\.(png|jpg|jpeg|gif|webp|mp4|webm|mov)$/i;

// List media files in a dir, sorted. Returns [] if the dir is missing.
function listMedia(dir) {
    try {
        return fs.readdirSync(dir).filter(f => MEDIA_RE.test(f)).sort();
    } catch (e) { return []; }
}

// List subdirectory names in a dir, sorted. Returns [] if the dir is missing.
function listDirs(dir) {
    try {
        return fs.readdirSync(dir, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => d.name)
            .sort();
    } catch (e) { return []; }
}

// Write JSON, creating parent dirs as needed. Logs each file for build output.
function writeJson(relPath, data) {
    const outPath = path.join(publicPath, relPath);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(data));
    console.log(`  ${relPath} (${Array.isArray(data) ? data.length : '?'} entries)`);
}

console.log('Building static listing manifests...');

// --- facial_recognishm puppets list --------------------------------------------
writeJson(
    path.join('facial_recognishm', 'puppets-list.json'),
    listMedia(path.join(publicPath, 'facial_recognishm', 'puppets'))
);

// --- puppet collections + per-collection hand/head lists -----------------------
const puppetsRoot = path.join(publicPath, 'puppets');

// Collections are driven off hand_puppets (every collection has hand puppets;
// head puppets are optional) — matching puppet_routes.js.
const collections = listDirs(path.join(puppetsRoot, 'hand_puppets'));
writeJson(path.join('puppets', 'collections.json'), collections);

for (const c of collections) {
    writeJson(
        path.join('puppets', 'hand-puppets-list', `${c}.json`),
        listMedia(path.join(puppetsRoot, 'hand_puppets', c))
    );
    // Head list may be empty — head puppets are optional.
    writeJson(
        path.join('puppets', 'head-puppets-list', `${c}.json`),
        listMedia(path.join(puppetsRoot, 'head_puppets', c))
    );
}

console.log('Manifests built.');
