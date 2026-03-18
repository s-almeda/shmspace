#!/usr/bin/env node
/**
 * generate-interactive-entries.js
 *
 * Scans shmspace-backend/portfolio/00_interactive/ for .html files and:
 *   - Screenshots each via headless Chrome (needs the dev server running on localhost:3001)
 *   - Saves the screenshot to assets/<name>_preview.png
 *   - Creates <name>.json if none exists (with preview, link, css fields)
 *   - Updates the `preview` field in an existing <name>.json (preserves link & css)
 *
 * Usage (from shmspace-backend/):
 *   node scripts/generate-interactive-entries.js
 *
 * Requirements:
 *   - Dev server running: node server.js  (port 3001)
 *   - puppeteer installed: npm install --save-dev puppeteer
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const INTERACTIVE_DIR = path.join(__dirname, '..', 'portfolio', '00_interactive');
const ASSETS_DIR = path.join(INTERACTIVE_DIR, 'assets');
const BASE_LOCAL_URL = 'http://localhost:3001/portfolio/00_interactive';
const BASE_PROD_URL = 'https://art.snailbunny.site/portfolio/00_interactive';
const SCREENSHOT_WIDTH = 1280;
const SCREENSHOT_HEIGHT = 720;

async function main() {
  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
  }

  const entries = fs.readdirSync(INTERACTIVE_DIR).filter(f =>
    /\.html$/i.test(f)
  );

  if (entries.length === 0) {
    console.log('No .html files found in 00_interactive/');
    return;
  }

  console.log(`Found ${entries.length} HTML file(s): ${entries.join(', ')}\n`);

  const browser = await puppeteer.launch({ headless: 'new' });

  for (const htmlFile of entries) {
    const baseName = htmlFile.replace(/\.html$/i, '');
    const previewRelative = `assets/${baseName}_preview.png`;
    const previewAbsolute = path.join(INTERACTIVE_DIR, previewRelative);
    const jsonPath = path.join(INTERACTIVE_DIR, `${baseName}.json`);
    const localUrl = `${BASE_LOCAL_URL}/${htmlFile}`;
    const prodUrl = `${BASE_PROD_URL}/${htmlFile}`;

    console.log(`Processing: ${htmlFile}`);
    console.log(`  → Screenshotting ${localUrl}`);

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: SCREENSHOT_WIDTH, height: SCREENSHOT_HEIGHT });
      await page.goto(localUrl, { waitUntil: 'networkidle2', timeout: 15000 });
      await new Promise(r => setTimeout(r, 7000));
      await page.screenshot({ path: previewAbsolute });
      await page.close();
      console.log(`  → Saved preview: ${previewRelative}`);
    } catch (err) {
      console.error(`  ✗ Screenshot failed: ${err.message}`);
      console.error('    Make sure the dev server is running on port 3001.');
      continue;
    }

    if (fs.existsSync(jsonPath)) {
      // Update only the preview field, preserve everything else
      let existing = {};
      try {
        existing = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      } catch (e) {
        console.warn(`  ! Could not parse existing JSON, overwriting.`);
      }
      existing.preview = previewRelative;
      fs.writeFileSync(jsonPath, JSON.stringify(existing, null, 2));
      console.log(`  → Updated preview in existing ${baseName}.json`);
    } else {
      // Create a new entry
      const entry = {
        title: baseName.replace(/_/g, ' '),
        preview: previewRelative,
        link: prodUrl,
        css: ''
      };
      fs.writeFileSync(jsonPath, JSON.stringify(entry, null, 2));
      console.log(`  → Created ${baseName}.json`);
    }

    console.log();
  }

  await browser.close();
  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
