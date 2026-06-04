/*
Puppet rig server routes — extracted from App.js so all puppet-related
server code lives alongside the rig (public/puppets/).

Usage in App.js:
    const publicPath = path.join(__dirname, 'public');
    app.use(require('./public/puppets/puppet_routes')(publicPath));

Note: this file sits under the express.static(public) dir, so its source is
fetchable at /puppets/puppet_routes.js. It holds no secrets (just route logic).
*/

const express = require('express');
const fs = require('fs');
const path = require('path');

const MEDIA_RE = /\.(png|jpg|jpeg|gif|webp|mp4|webm|mov)$/i;
// Collection names must be a single safe path segment (no slashes / traversal).
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

// List media files in a dir, sorted. Returns [] if the dir is missing.
function safeList(dir) {
    try {
        return fs.readdirSync(dir).filter(f => MEDIA_RE.test(f)).sort();
    } catch (e) { return []; }
}

// List subdirectory names in a dir, sorted. Returns [] if the dir is missing.
function safeListDirs(dir) {
    try {
        return fs.readdirSync(dir, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => d.name)
            .sort();
    } catch (e) { return []; }
}

module.exports = (publicPath) => {
    const router = express.Router();
    const puppetsRoot = path.join(publicPath, 'puppets');

    // Rig entry point — /puppets and /puppets?show=<name>
    router.get('/puppets', function (_req, res) {
        res.sendFile(path.join(puppetsRoot, 'index.html'));
    });

    // Available puppet collections — the subfolders shared by hand_puppets/ &
    // head_puppets/ (e.g. ["cs10", "default", "lightning_talk"]). Driven off
    // hand_puppets since every collection has hand puppets; head puppets are optional.
    router.get('/puppets/collections', function (_req, res) {
        res.json(safeListDirs(path.join(puppetsRoot, 'hand_puppets')));
    });

    // Hand puppet listing for a collection
    router.get('/puppets/hand-puppets-list/:collection', function (req, res) {
        const c = req.params.collection;
        if (!SAFE_NAME.test(c)) return res.status(400).json([]);
        res.json(safeList(path.join(puppetsRoot, 'hand_puppets', c)));
    });

    // Head puppet listing for a collection (may be empty — head puppets are optional)
    router.get('/puppets/head-puppets-list/:collection', function (req, res) {
        const c = req.params.collection;
        if (!SAFE_NAME.test(c)) return res.status(400).json([]);
        res.json(safeList(path.join(puppetsRoot, 'head_puppets', c)));
    });

    // Show script
    router.get('/puppets/shows/:show/script', function (req, res) {
        res.sendFile(path.join(puppetsRoot, 'shows', req.params.show, 'game_script.json'));
    });

    return router;
};
