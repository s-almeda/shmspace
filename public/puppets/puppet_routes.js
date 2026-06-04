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

// List media files in a dir, sorted. Returns [] if the dir is missing.
function safeList(dir) {
    try {
        return fs.readdirSync(dir).filter(f => MEDIA_RE.test(f)).sort();
    } catch (e) { return []; }
}

module.exports = (publicPath) => {
    const router = express.Router();
    const puppetsRoot = path.join(publicPath, 'puppets');

    // Rig entry point — /puppets and /puppets?show=<name>
    router.get('/puppets', function (_req, res) {
        res.sendFile(path.join(puppetsRoot, 'index.html'));
    });

    // Hand puppet listings
    router.get('/puppets/default-puppets-list', function (_req, res) {
        res.json(safeList(path.join(puppetsRoot, 'default_puppets')));
    });
    router.get('/puppets/shows/:show/puppets-list', function (req, res) {
        res.json(safeList(path.join(puppetsRoot, 'shows', req.params.show, 'puppets')));
    });

    // Head puppet listings (separate folder from hand puppets)
    router.get('/puppets/default-head-puppets-list', function (_req, res) {
        res.json(safeList(path.join(puppetsRoot, 'default_head_puppets')));
    });
    router.get('/puppets/shows/:show/head-puppets-list', function (req, res) {
        res.json(safeList(path.join(puppetsRoot, 'shows', req.params.show, 'head_puppets')));
    });

    // Show script
    router.get('/puppets/shows/:show/script', function (req, res) {
        res.sendFile(path.join(puppetsRoot, 'shows', req.params.show, 'game_script.json'));
    });

    return router;
};
