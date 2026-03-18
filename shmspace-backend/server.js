// server.js -- backend server for shmspace
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const allowedOrigins = [
  'http://localhost:3000',
  'https://snailbunny.site',
  'https://www.snailbunny.site',
  'http://localhost:8000',
  'https://shmuh.co'
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));


// add "collections" server routes
app.use('/api/collections', require('./garbage_collections/collections'));


app.get('/', (req, res) => {
    res.send("if you're reading this, the shmspace-backend works! updated march 17 @ 12:01AM");
});

app.use('/portfolio', express.static(path.join(__dirname, 'portfolio')));
app.use(express.static(path.join(__dirname, '..', 'public')));


// In your server.js, update the description endpoint:
app.get('/api/description/*', async (req, res) => {
  const filePath = req.params[0];
  const mdPath = path.join(__dirname, 'portfolio', filePath);
  
  try {
    const { marked } = await import('marked');
    const markdown = fs.readFileSync(mdPath, 'utf-8'); // Make sure it's reading the full file
    const html = marked.parse(markdown);
    res.json({ html });
  } catch (error) {
    res.status(404).json({ error: 'Description not found' });
  }
});

app.get('/api/portfolio-files', (req, res) => {
  const portfolioPath = path.join(__dirname, 'portfolio');
  
  function readDirRecursive(dirPath) {
    const items = fs.readdirSync(dirPath);
    const result = { files: [] };
    
    items.forEach(item => {
      const fullPath = path.join(dirPath, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        result[item] = readDirRecursive(fullPath);
      } else if (/\.(jpg|jpeg|png|gif|webp|pdf|html|mp4)$/i.test(item)) {
        result.files.push(item);
      }
    });
    
    return result;
  }
  
  const structure = { portfolio: readDirRecursive(portfolioPath) };
  res.json(structure);
});

app.get('/bart', (_req, res) => res.redirect('/api/bart/tube'));
app.use('/api/bart', require('./bart/bart'));

app.listen(3001, () => {
  console.log('Server running on port 3001');
});