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

// Returns sorted list of image filenames from the puppets folder
app.get('/facial_recognishm/puppets-list', function (_req, res) {
    const fs = require('fs');
    const puppetsDir = path.join(publicPath, 'facial_recognishm', 'puppets');
    const files = fs.readdirSync(puppetsDir)
        .filter(f => /\.(png|jpg|jpeg|gif|webp|mp4|webm|mov)$/i.test(f))
        .sort();
    res.json(files);
});

app.get('/artographer', (_req, res) => {
    res.redirect('https://image-space-cyan.vercel.app/v8');
});

// Generic puppeteering rig — /puppets and /puppets?show=<name>
const fs = require('fs');
app.get('/puppets', function (_req, res) {
    res.sendFile(publicPath + '/puppets/index.html');
});
app.get('/puppets/default-puppets-list', function (_req, res) {
    const dir = path.join(publicPath, 'puppets', 'default_puppets');
    const files = fs.readdirSync(dir).filter(f => /\.(png|jpg|jpeg|gif|webp|mp4|webm|mov)$/i.test(f)).sort();
    res.json(files);
});
app.get('/puppets/shows/:show/puppets-list', function (req, res) {
    const dir = path.join(publicPath, 'puppets', 'shows', req.params.show, 'puppets');
    const files = fs.readdirSync(dir).filter(f => /\.(png|jpg|jpeg|gif|webp|mp4|webm|mov)$/i.test(f)).sort();
    res.json(files);
});
app.get('/puppets/shows/:show/script', function (req, res) {
    res.sendFile(path.join(publicPath, 'puppets', 'shows', req.params.show, 'game_script.json'));
});


//run this server by entering "node App.js" using your command line. 
   app.listen(port, () => {
     console.log(`Server is running on http://${host}:${port}`);
   });



