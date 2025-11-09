// garbage_collections/db.js
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'collections.db');
const db = new Database(dbPath);

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS collections (
    uid TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    user_name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('Magazine', 'Stack')),
    page_count INTEGER DEFAULT 0,
    page_list TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS pages (
    uid TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('text', 'image')),
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

module.exports = db;