// server.js -- backend server for shmspace
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

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
    res.send("if you're reading this, the shmspace-backend works! updated march 2 @ 11:45pm");
});

app.use('/portfolio', express.static(path.join(__dirname, 'portfolio')));


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

// BART dummy data endpoint
const BART_DATA = `Platform 1
Daly City 18 min (6 car), 38 min (6 car), 58 min (6 car)
Millbrae 97 min (9 car), 8 min (9 car), 28 min (9 car)

Platform 2
Antioch 5 min (9 car), 24 min (9 car), 42 min (9 car)
Dublin/Pleasanton 11 min (6 car), 31 min (6 car), 50 min (6 car)`;

app.get('/api/bart', (req, res) => {
  res.send(BART_DATA);
});

app.listen(3001, () => {
  console.log('Server running on port 3001');
});