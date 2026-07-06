/*
Based on the Node + Express Example code I made for CS160 Summer 2022
by Shm Garanganao Almeda 

Code referenced from: 
https://www.digitalocean.com/community/tutorials/how-to-create-a-web-server-in-node-js-with-the-http-module"
https://expressjs.com/en/starter/hello-world.html
https://codeforgeek.com/render-html-file-expressjs/
https://stackoverflow.com/questions/32257736/app-use-express-serve-multiple-html

Photo Credits:
Bunny by Satyabratasm on Unsplash <https://unsplash.com/photos/u_kMWN-BWyU>
*/

//Node modules to *require*
//if these cause errors, be sure you've installed them, ex: 'npm install express'
const express = require('express');
const favicon = require('express-favicon');
const router = express.Router();
const app = express();
const path = require('path');

//specify that we want to run our website on 'http://localhost:8000/'
const host = 'localhost';
const port = 8000;

var publicPath = path.join(__dirname, 'public'); //get the path to use our "public" folder where we stored our html, css, images, etc
app.use(express.static(publicPath));  //tell express to use that folder

//tell express where our custom favicon is located
app.use(favicon(path.join(__dirname,'public','images','favicon.ico')));


//here's where we specify what to send to users that connect to our web server...
//if there's no url extension, it will show "index.html"
router.get("/", function (req, res) {
    res.sendFile(path.join(__dirname, "/"));
});

app.get('/miku', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/images/mikus.jpg'));
});


//depending on what url extension the user navigates to, send them the respective html file. 
app.get('/about', function (req, res) {
    res.sendFile(publicPath + '/');
});
app.get('/cv', function (req, res) {
    res.sendFile(publicPath + '/cv.html');
});
app.get('/c', function (req, res) {
    res.sendFile(publicPath + '/c.html');
});
app.get('/portfolio', function (req, res) {
    res.sendFile(publicPath + '/portfolio.html');
});
app.get('/recognize_me', function (req, res) {
    res.sendFile(publicPath + '/facial_recognishm/index.html');
});

// each paper lives in public/papers/<name>/<name>.html — /papers/<name> serves it.
// drop in a new public/papers/<folder>/<folder>.html and the same URL scheme just works.
app.get('/papers/:paper', function (req, res, next) {
    const paper = req.params.paper;
    if (!/^[a-zA-Z0-9_-]+$/.test(paper)) return next(); // reject odd/unsafe names
    res.sendFile(path.join(publicPath, 'papers', paper, paper + '.html'), function (err) {
        if (err) next(); // fall through to 404 if that paper folder/file doesn't exist
    });
});

// Returns sorted list of image filenames from the puppets folder
app.get('/facial_recognishm/puppets-list', function (_req, res) {
    const fs = require('fs');
    const puppetsDir = path.join(publicPath, 'facial_recognishm', 'puppets');
    const files = fs.readdirSync(puppetsDir)
        .filter(f => /\.(png|jpg|jpeg|gif|webp|mp4|webm|mov)$/i.test(f))
        .sort();
    res.json(files);
});

// SHMUH.CO/... short URL -> destination. add a line here to add a redirect.
const redirects = {
    '/artographer':   '/papers/artographer/',
    '/aitl':          'https://art.snailbunny.site/portfolio/0_FEATURED/artist_in_the_loop.html',
    '/rsp':           'https://art.snailbunny.site/portfolio/0_FEATURED/artist_in_the_loop.html',
    '/rsp0':          'https://art.snailbunny.site/portfolio/0_FEATURED/artist_in_the_loop.html',   
    '/bart':          'https://art.snailbunny.site/portfolio/0_FEATURED/shm_X_bart.html',
    '/walo':          'https://drive.google.com/file/d/1084qTZ1h9WmhtC-w2g-UyvVDSoCoEfzg/view?usp=sharing',
    '/shmuppetry':    'https://art.snailbunny.site/portfolio/0_FEATURED/shmuppetry.html',
    '/tube':          'https://art.snailbunny.site/api/bart/tube',
    '/art_education': '/papers/art_education/',
    '/art-education': '/papers/art_education/',
};
for (const [from, to] of Object.entries(redirects)) {
    app.get(from, (_req, res) => res.redirect(to));
}

// param redirect — keeps its own route since it interpolates the path segment
app.get('/artographer/:path', (_req, res) => {
    res.redirect(`https://artographer.snailbunny.site/${_req.params.path}`);
});

// Generic puppeteering rig — all puppet routes live alongside the rig.
app.use(require('./public/puppets/puppet_routes')(publicPath));


//run this server by entering "node App.js" using your command line. 
   app.listen(port, () => {
     console.log(`Server is running on http://${host}:${port}`);
   });



