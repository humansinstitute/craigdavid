#!/usr/bin/env node
// context-montage-watcher.js - Watches for weekly_vm_results.json and triggers montage tool
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { nip19 } from 'nostr-tools';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.join(__dirname, 'output');
const POLL_INTERVAL = 2000; // 2s
const PROCESSING_DELAY = 1000; // 1s
const TRIGGER_URL = process.env.TRIGGER_URL || 'http://dev.otherstuff.studio:3000/api/triggers/';
const TRIGGER_TOKEN = process.env.TRIGGER_TOKEN || process.env.TRIGGER_BEARER || '';
const RECIPE_ID = process.env.TRIGGER_RECIPE_ID || '24fff1dda53900e41493cdf2ff643854';
const SESSION_NAME = process.env.TRIGGER_SESSION_NAME || 'Short Video Montage';

// Track processed items
const processedFiles = new Set();
const STARTUP_TIME = Date.now();

console.log('[MontageWatcher] Started');
console.log(`[MontageWatcher] Monitoring: ${OUTPUT_DIR}`);
console.log(`[MontageWatcher] Startup: ${new Date(STARTUP_TIME).toISOString()}`);

function hasMediaFiles(dir) {
  try {
    const exts = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', '.webm', '.mkv']);
    const entries = fs.readdirSync(dir);
    return entries.some(f => exts.has(path.extname(f).toLowerCase()));
  } catch {
    return false;
  }
}

function findActivityJson(dir) {
  // Accept several common names; also accept events.json written by prefetch
  const candidates = ['activity.json', 'activities.json', 'activitiy.json', 'events.json'];
  for (const name of candidates) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function processMontage(npub, weeklyPath) {
  const cacheKey = `${npub}:${weeklyPath}:montage`;
  if (processedFiles.has(cacheKey)) return;

  // Avoid reprocessing if montage output exists
  const npubDir = path.dirname(weeklyPath);
  const montageDir = path.join(npubDir, 'montage');
  const outPath = path.join(npubDir, 'montage_vm_results.json');
  if (fs.existsSync(outPath)) {
    processedFiles.add(cacheKey);
    return;
  }

  console.log(`[MontageWatcher] Processing weekly montage for ${npub}`);

  try {
    if (!fs.existsSync(weeklyPath)) {
      console.log(`[MontageWatcher] Missing weekly_vm_results.json for ${npub}`);
      return;
    }

    const weekly = JSON.parse(fs.readFileSync(weeklyPath, 'utf8'));
    const weeklyResponse = typeof weekly?.response === 'string' ? weekly.response.trim() : '';
    if (!weeklyResponse) {
      console.log(`[MontageWatcher] weekly_vm_results.json has no response for ${npub}, skipping`);
      return;
    }

    // Validate montage input directory and assets
    if (!fs.existsSync(montageDir) || !fs.statSync(montageDir).isDirectory()) {
      console.log(`[MontageWatcher] No montage directory for ${npub} at ${montageDir}`);
      return;
    }

    const activityPath = findActivityJson(montageDir);
    if (!activityPath) {
      console.log(`[MontageWatcher] Missing activity.json/events.json in ${montageDir} for ${npub}`);
      return;
    }

    if (!hasMediaFiles(montageDir)) {
      console.log(`[MontageWatcher] No image/video media found in ${montageDir} for ${npub}`);
      return;
    }

    // Determine subject hex from folder name (optional)
    let subjectHex = null;
    try {
      const decoded = nip19.decode(npub);
      if (decoded.type === 'npub' && typeof decoded.data === 'string') subjectHex = decoded.data;
    } catch {}

    // Build API trigger prompt including weekly result text
    const prompt = [
      'Please create a 30 second montage video as per your instructions from these files.',
      'Limit the number of files to 15 using ~2 second clips; you can select them at random.',
      '',
      "Here's the song that describes the week:",
      weeklyResponse,
    ].join('\n');

    if (!TRIGGER_TOKEN) {
      console.warn('[MontageWatcher] Missing TRIGGER_TOKEN; cannot call trigger API.');
      return;
    }

    // Call local trigger API
    let apiResponse = null;
    try {
      const res = await fetch(TRIGGER_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TRIGGER_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipe_id: RECIPE_ID,
          prompt,
          session_name: SESSION_NAME,
          dir: montageDir,
        }),
      });
      const text = await res.text();
      try { apiResponse = JSON.parse(text); } catch { apiResponse = { raw: text }; }
      if (!res.ok) {
        console.error(`[MontageWatcher] ✗ Trigger API failed for ${npub}: ${res.status} ${res.statusText}`);
        console.error('[MontageWatcher] Response:', text);
        return;
      }
    } catch (e) {
      console.error(`[MontageWatcher] ✗ Trigger API error for ${npub}:`, e.message);
      return;
    }

    // All done; mark processed and persist results
    processedFiles.add(cacheKey);
    const out = {
      api: TRIGGER_URL,
      recipe_id: RECIPE_ID,
      session_name: SESSION_NAME,
      subject: { npub, hex: subjectHex },
      dir: montageDir,
      prompt,
      response: apiResponse,
    };
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
    console.log(`[MontageWatcher] ✓ Triggered montage for ${npub}`);
    console.log(`[MontageWatcher] Results: ${outPath}`);
  } catch (e) {
    console.error(`[MontageWatcher] Error processing montage for ${npub}:`, e);
  }
}

function checkForWeeklyResults() {
  try {
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      return;
    }

    const dirs = fs.readdirSync(OUTPUT_DIR).filter(d => d.startsWith('npub') && fs.statSync(path.join(OUTPUT_DIR, d)).isDirectory());
    for (const npub of dirs) {
      const npubDir = path.join(OUTPUT_DIR, npub);
      const weeklyPath = path.join(npubDir, 'weekly_vm_results.json');
      if (!fs.existsSync(weeklyPath)) continue;

      const stat = fs.statSync(weeklyPath);
      const cacheKey = `${npub}:${weeklyPath}:montage`;
      const isRecent = stat.mtime.getTime() > STARTUP_TIME;

      if (isRecent && !processedFiles.has(cacheKey)) {
        console.log(`[MontageWatcher] Found weekly_vm_results.json for ${npub} (modified ${stat.mtime.toISOString()})`);
        setTimeout(() => processMontage(npub, weeklyPath), PROCESSING_DELAY);
      }
    }
  } catch (e) {
    console.error('[MontageWatcher] Error scanning output:', e);
  }
}

setInterval(checkForWeeklyResults, POLL_INTERVAL);
checkForWeeklyResults();

process.on('SIGINT', () => { console.log('\n[MontageWatcher] Shutting down...'); process.exit(0); });
process.on('SIGTERM', () => { console.log('[MontageWatcher] Shutting down...'); process.exit(0); });
