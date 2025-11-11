// garbage_collections/collections.js
const db = require('./db');
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Generate UUID using Node's built-in crypto
function uuidv4() {
  return crypto.randomUUID();
}

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const upload = multer({
  dest: uploadsDir,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 20 // max 20 files at once
  },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'image/jpeg', 
      'image/png', 
      'image/gif', 
      'image/webp',
      'application/octet-stream' // Sometimes webp files are detected as this
    ];
    
    // Extra check: if it's octet-stream, check the file extension
    if (file.mimetype === 'application/octet-stream') {
      const ext = file.originalname.toLowerCase().split('.').pop();
      if (!['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
        return cb(new Error(`Invalid file type: ${file.mimetype} with extension .${ext}`));
      }
    }
    
    console.log('File mimetype:', file.mimetype, 'Original name:', file.originalname);
    
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Only images allowed.`));
    }
  }
});

const router = express.Router();

// Test route
router.get('/', (req, res) => {
  res.json({ message: 'Collections API' });
});

// Create a new collection from uploaded images
router.post('/', upload.array('images'), (req, res) => {
  try {
    console.log('Request body:', req.body);
    console.log('Request files:', req.files);
    console.log('Content-Type:', req.get('content-type'));
    
    // Check if req.body exists
    if (!req.body) {
      return res.status(400).json({ error: 'Request body is missing' });
    }
    
    const { type = 'Stack', name, description, user_name, cover_image_index } = req.body;
    
    console.log('Parsed values:', { type, name, description, user_name, cover_image_index });
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No images uploaded' });
    }

    if (!name || !user_name) {
      return res.status(400).json({ error: 'Collection name and user name are required' });
    }

    const collectionUid = uuidv4();
    const pageUids = [];
    let coverImageFilename = null;

    // Create a page for each uploaded image
    const insertPage = db.prepare('INSERT INTO pages (uid, type, content) VALUES (?, ?, ?)');
    
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const pageUid = uuidv4();
      const filename = `${pageUid}${path.extname(file.originalname)}`;
      const newPath = path.join(uploadsDir, filename);
      
      // Move file to permanent location with UUID name
      fs.renameSync(file.path, newPath);
      
      // Create page record
      insertPage.run(pageUid, 'image', filename);
      pageUids.push(pageUid);

      // Set cover image (either specified index or first image)
      if ((cover_image_index && parseInt(cover_image_index) === i) || (!cover_image_index && i === 0)) {
        coverImageFilename = filename;
      }
    }

    // Create collection record
    const insertCollection = db.prepare(`
      INSERT INTO collections (uid, name, description, cover_image, user_name, type, page_count, page_list) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    insertCollection.run(
      collectionUid, 
      name,
      description || null,
      coverImageFilename,
      user_name,
      type, 
      pageUids.length, 
      JSON.stringify(pageUids)
    );

    res.json({
      collection: {
        uid: collectionUid,
        name: name,
        description: description,
        cover_image: coverImageFilename,
        user_name: user_name,
        type: type,
        page_count: pageUids.length,
        pages: pageUids
      }
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Get a specific collection
router.get('/:uid', (req, res) => {
  try {
    const collection = db.prepare('SELECT * FROM collections WHERE uid = ?').get(req.params.uid);
    
    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    // Get all pages for this collection
    const pageUids = JSON.parse(collection.page_list || '[]');
    const pages = db.prepare('SELECT * FROM pages WHERE uid IN (' + pageUids.map(() => '?').join(',') + ')').all(...pageUids);
    
    // Sort pages by the order in page_list
    const sortedPages = pageUids.map(uid => pages.find(page => page.uid === uid)).filter(Boolean);

    res.json({
      collection: {
        uid: collection.uid,
        name: collection.name,
        description: collection.description,
        cover_image: collection.cover_image,
        user_name: collection.user_name,
        type: collection.type,
        page_count: collection.page_count,
        created_at: collection.created_at
      },
      pages: sortedPages
    });

  } catch (error) {
    console.error('Get collection error:', error);
    res.status(500).json({ error: 'Failed to get collection' });
  }
});

// Serve uploaded images
router.get('/uploads/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(uploadsDir, filename);
  
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'Image not found' });
  }
});

// List all collections (for debugging/admin)
router.get('/admin/list', (req, res) => {
  try {
    const collections = db.prepare('SELECT uid, name, description, cover_image, user_name, type, page_count, created_at FROM collections ORDER BY created_at DESC').all();
    res.json({ collections });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list collections' });
  }
});

// Add a page to an existing collection
router.post('/:uid/pages', (req, res) => {
  // Handle both multipart (image) and JSON (text) requests
  const handleRequest = () => {
    try {
      let user_name, text_content;
      
      // Check if it's multipart (image upload) or JSON (text)
      if (req.get('content-type')?.includes('multipart')) {
        user_name = req.body.user_name;
        text_content = req.body.text_content;
      } else {
        user_name = req.body.user_name;
        text_content = req.body.text_content;
      }

      const collectionUid = req.params.uid;

      if (!user_name) {
        return res.status(400).json({ error: 'User name is required' });
      }

      // Check if collection exists and user owns it
      const collection = db.prepare('SELECT * FROM collections WHERE uid = ?').get(collectionUid);
      if (!collection) {
        return res.status(404).json({ error: 'Collection not found' });
      }
      if (collection.user_name !== user_name) {
        return res.status(403).json({ error: 'You can only edit your own collections' });
      }

      const pageUid = uuidv4();
      let pageType, content;

      if (req.file) {
        // Image page
        pageType = 'image';
        const filename = `${pageUid}${path.extname(req.file.originalname)}`;
        const newPath = path.join(uploadsDir, filename);
        fs.renameSync(req.file.path, newPath);
        content = filename;
      } else if (text_content) {
        // Text page
        pageType = 'text';
        content = text_content;
      } else {
        return res.status(400).json({ error: 'Either image or text content is required' });
      }

      // Create page
      const insertPage = db.prepare('INSERT INTO pages (uid, type, content) VALUES (?, ?, ?)');
      insertPage.run(pageUid, pageType, content);

      // Update collection
      const pageList = JSON.parse(collection.page_list || '[]');
      pageList.push(pageUid);
      
      const updateCollection = db.prepare('UPDATE collections SET page_count = ?, page_list = ? WHERE uid = ?');
      updateCollection.run(pageList.length, JSON.stringify(pageList), collectionUid);

      res.json({
        success: true,
        page: { uid: pageUid, type: pageType, content }
      });

    } catch (error) {
      console.error('Add page error:', error);
      res.status(500).json({ error: 'Failed to add page' });
    }
  };

  // Apply appropriate middleware based on content type
  if (req.get('content-type')?.includes('multipart')) {
    upload.single('image')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      handleRequest();
    });
  } else {
    express.json()(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      handleRequest();
    });
  }
});

// Delete a page from a collection
router.delete('/:collection_uid/pages/:page_uid', express.json(), (req, res) => {
  try {
    const { collection_uid, page_uid } = req.params;
    const { user_name } = req.body;

    if (!user_name) {
      return res.status(400).json({ error: 'User name is required' });
    }

    // Check if collection exists and user owns it
    const collection = db.prepare('SELECT * FROM collections WHERE uid = ?').get(collection_uid);
    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }
    if (collection.user_name !== user_name) {
      return res.status(403).json({ error: 'You can only edit your own collections' });
    }

    // Check if page exists
    const page = db.prepare('SELECT * FROM pages WHERE uid = ?').get(page_uid);
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    // Delete image file if it's an image page
    if (page.type === 'image') {
      const filePath = path.join(uploadsDir, page.content);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Delete page from database
    const deletePage = db.prepare('DELETE FROM pages WHERE uid = ?');
    deletePage.run(page_uid);

    // Update collection page list
    const pageList = JSON.parse(collection.page_list || '[]');
    const updatedPageList = pageList.filter(uid => uid !== page_uid);
    
    const updateCollection = db.prepare('UPDATE collections SET page_count = ?, page_list = ? WHERE uid = ?');
    updateCollection.run(updatedPageList.length, JSON.stringify(updatedPageList), collection_uid);

    res.json({ success: true, message: 'Page deleted' });

  } catch (error) {
    console.error('Delete page error:', error);
    res.status(500).json({ error: 'Failed to delete page' });
  }
});

// Update collection name, description, and/or cover image
router.patch('/:uid', express.json(), (req, res) => {
  try {
    const collectionUid = req.params.uid;
    const { user_name, name, description, cover_image } = req.body;

    if (!user_name) {
      return res.status(400).json({ error: 'User name is required' });
    }
    if (!name && description === undefined && !cover_image) {
      return res.status(400).json({ error: 'Either name, description, or cover_image is required' });
    }

    // Check if collection exists and user owns it
    const collection = db.prepare('SELECT * FROM collections WHERE uid = ?').get(collectionUid);
    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }
    if (collection.user_name !== user_name) {
      return res.status(403).json({ error: 'You can only edit your own collections' });
    }

    // If setting cover_image, verify it's a valid filename in this collection
    if (cover_image) {
      const pageList = JSON.parse(collection.page_list || '[]');
      const pages = db.prepare('SELECT content FROM pages WHERE uid IN (' + pageList.map(() => '?').join(',') + ') AND type = "image"').all(...pageList);
      const validFilenames = pages.map(p => p.content);
      
      if (!validFilenames.includes(cover_image)) {
        return res.status(400).json({ error: 'Cover image must be one of the images in this collection' });
      }
    }

    // Build update query dynamically
    const updates = [];
    const values = [];
    
    if (name) {
      updates.push('name = ?');
      values.push(name);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (cover_image) {
      updates.push('cover_image = ?');
      values.push(cover_image);
    }
    
    values.push(collectionUid);

    // Update collection
    const updateCollection = db.prepare(`UPDATE collections SET ${updates.join(', ')} WHERE uid = ?`);
    updateCollection.run(...values);

    res.json({ success: true, message: 'Collection updated' });

  } catch (error) {
    console.error('Update collection error:', error);
    res.status(500).json({ error: 'Failed to update collection' });
  }
});

module.exports = router;