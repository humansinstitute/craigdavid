#!/usr/bin/env node
// montage-video-poster-watcher.js - Watches for ai-video.mp4 and posts a Nostr note with Blossom URL
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { nip19, finalizeEvent, getPublicKey, nip98 } from 'nostr-tools';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.join(__dirname, 'output');
const POLL_INTERVAL = 2000; // 2s
const PROCESSING_DELAY = 500; // 0.5s

// Config
const CRAIG_PRIVKEY = process.env.CRAIG_DAVID || process.env.CLIENT_PRIVATE_KEY || '';
const DEFAULT_BLOSSOM_SERVERS = (process.env.BLOSSOM_SERVERS || 'https://blossom.primal.net/').split(',').map(s => s.trim()).filter(Boolean);
const BLOSSOM_UPLOAD_PATHS = (process.env.BLOSSOM_UPLOAD_PATHS || ',upload,api/upload,files,api/files').split(',').map(s => s.trim()); // try common variants
const DEBUG = process.env.VIDEO_POSTER_DEBUG === '1' || process.env.VIDEO_POSTER_DEBUG === 'true';
const DEFAULT_RELAYS = (process.env.NOSTR_RELAYS || process.env.CVM_RELAYS || 'wss://relay.damus.io,wss://nos.lol,wss://purplepag.es/,wss://index.hzrd149.com/,wss://relay.devvul.com').split(',').map(s => s.trim()).filter(Boolean);

// Track processed files
const processed = new Set();
const STARTUP_TIME = Date.now();

console.log('[VideoPoster] Started');
console.log(`[VideoPoster] Monitoring: ${OUTPUT_DIR}`);

// Helper: derive subject hex from npub directory name
function npubDirToHex(npub) {
  try {
    const d = nip19.decode(npub);
    if (d.type === 'npub' && typeof d.data === 'string') return d.data;
  } catch {}
  return undefined;
}

// Blossom upload using NIP-98 auth. Tries a few strategies/endpoints.
async function uploadToBlossom(filePath, servers = DEFAULT_BLOSSOM_SERVERS) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new Error('Not a file');
  const fileName = path.basename(filePath);
  const fileBuf = fs.readFileSync(filePath);
  const methods = ['POST'];
  const endpoints = BLOSSOM_UPLOAD_PATHS; // server + endpoint

  // signer: nip98 expects a function that signs an event
  const signer = async (evt) => finalizeEvent(evt, CRAIG_PRIVKEY);
  const sha256 = crypto.createHash('sha256').update(fileBuf).digest('hex');

  for (const server of servers) {
    const base = server.endsWith('/') ? server : server + '/';
    for (const endpoint of endpoints) {
      const url = base + endpoint;
      for (const method of methods) {
        try {
          // Strategy A: raw bytes, include payload in token
          const tokenA = await nip98.getToken(url, method, signer, true, fileBuf);
          const resA = await fetch(url, {
            method,
            headers: {
              'Authorization': tokenA,
              'Content-Type': 'video/mp4',
              'Content-Length': String(fileBuf.length),
              'Accept': 'application/json,text/plain,application/octet-stream,*/*',
              'X-Filename': encodeURIComponent(fileName),
            },
            body: fileBuf,
          });
          const outA = await parseUploadResponse(resA, { label: 'raw-bytes', url });
          if (outA?.url) return { server, ...outA };
        } catch (e) {
          // fall through to multipart attempt
          if (DEBUG) console.warn('[VideoPoster] raw-bytes upload error:', e?.message || e);
        }

        try {
          // Strategy B: multipart/form-data, no payload in token
          const form = new FormData();
          form.append('file', new Blob([fileBuf], { type: 'video/mp4' }), fileName);
          // Include filename/mime hints if server supports
          form.append('filename', fileName);
          form.append('m', 'video/mp4');

          const tokenB = await nip98.getToken(url, method, signer, true);
          const resB = await fetch(url, {
            method,
            headers: {
              'Authorization': tokenB,
              'Accept': 'application/json,text/plain,*/*',
            },
            body: form,
          });
          const outB = await parseUploadResponse(resB, { label: 'multipart', url });
          if (outB?.url) return { server, ...outB };
        } catch (e) {
          // try next
          if (DEBUG) console.warn('[VideoPoster] multipart upload error:', e?.message || e);
        }
      }
    }

    // Strategy C: PUT /<sha256> (some servers support addressable PUT by hash)
    try {
      const putUrl = base + sha256;
      const tokenC = await nip98.getToken(putUrl, 'PUT', signer, true, fileBuf);
      const resC = await fetch(putUrl, {
        method: 'PUT',
        headers: {
          'Authorization': tokenC,
          'Content-Type': 'video/mp4',
          'Content-Length': String(fileBuf.length),
          'Accept': 'application/json,text/plain,*/*',
          'X-Filename': encodeURIComponent(fileName),
        },
        body: fileBuf,
      });
      const outC = await parseUploadResponse(resC, { label: 'put-hash', url: putUrl });
      if (outC?.url) return { server, ...outC };
    } catch (e) {
      if (DEBUG) console.warn('[VideoPoster] put-hash upload error:', e?.message || e);
    }
  }
  throw new Error('All Blossom uploads failed');
}

async function parseUploadResponse(res, ctx) {
  // Successful response may be JSON with { url, tags } or plain text URL, or Location header
  try {
    if (res.ok) {
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('application/json')) {
        const j = await res.json().catch(() => null);
        if (j && typeof j === 'object') {
          const url = j.url || (Array.isArray(j.tags) && j.tags[0]?.[0] === 'url' ? j.tags[0][1] : undefined);
          const tags = Array.isArray(j.tags) ? j.tags : undefined;
          if (url) return { url, tags };
        }
      }
      const loc = res.headers.get('location') || res.headers.get('Location');
      if (loc && /^https?:\/\//.test(loc)) return { url: loc };
      const text = await res.text();
      const m = text.match(/https?:\/\/\S+/);
      if (m) return { url: m[0] };
    } else {
      if (DEBUG) {
        let body;
        try { body = await res.text(); } catch { body = '<unreadable>'; }
        console.warn('[VideoPoster] upload non-ok', { status: res.status, url: ctx?.url, mode: ctx?.label, body: (body || '').slice(0, 300) });
      }
    }
  } catch {}
  return undefined;
}

async function postNostrVideoNote({ subjectHex, url }) {
  if (!CRAIG_PRIVKEY || CRAIG_PRIVKEY.length !== 64) throw new Error('Missing CRAIG_DAVID private key');
  const pubkey = await getPublicKey(CRAIG_PRIVKEY);
  const created_at = Math.floor(Date.now() / 1000);
  const content = `Weekly montage video: ${url}`;
  const tags = [];
  if (subjectHex) tags.push(['p', subjectHex]);
  tags.push(['t', 'cd-video']);

  const unsigned = { kind: 1, content, tags, created_at, pubkey };
  const signed = finalizeEvent(unsigned, CRAIG_PRIVKEY);

  // Publish using applesauce-relay (lazy import to avoid bundling for server)
  const { RelayPool } = await import('applesauce-relay');
  const pool = new RelayPool();
  const relays = DEFAULT_RELAYS;
  const results = await pool.publish(relays, signed).catch(() => []);
  return { event: signed, relays, results };
}

function checkForAiVideo() {
  try {
    if (!fs.existsSync(OUTPUT_DIR)) return;
    const dirs = fs.readdirSync(OUTPUT_DIR).filter(d => d.startsWith('npub') && fs.statSync(path.join(OUTPUT_DIR, d)).isDirectory());
    for (const npub of dirs) {
      const npubDir = path.join(OUTPUT_DIR, npub);
      const montageDir = path.join(npubDir, 'montage');
      const videoPath = path.join(montageDir, 'ai-video.mp4');
      if (!fs.existsSync(videoPath)) continue;

      // Skip if we already produced results
      const resultsPath = path.join(montageDir, 'video_post_results.json');
      const stat = fs.statSync(videoPath);
      const cacheKey = `${npub}:${videoPath}`;
      const isRecent = stat.mtime.getTime() > STARTUP_TIME;
      const already = processed.has(cacheKey) || fs.existsSync(resultsPath);
      if (!isRecent || already) continue;

      processed.add(cacheKey);
      setTimeout(() => processVideo(npub, montageDir, videoPath, resultsPath), PROCESSING_DELAY);
    }
  } catch (e) {
    console.error('[VideoPoster] scan error:', e);
  }
}

async function processVideo(npub, montageDir, videoPath, resultsPath) {
  console.log(`[VideoPoster] Found video for ${npub}: ${videoPath}`);
  const subjectHex = npubDirToHex(npub);
  const res = { npub, subjectHex, videoPath, startedAt: new Date().toISOString() };
  try {
    const uploaded = await uploadToBlossom(videoPath);
    res.upload = uploaded;
    console.log(`[VideoPoster] Uploaded -> ${uploaded.url}`);

    const post = await postNostrVideoNote({ subjectHex, url: uploaded.url });
    res.post = { eventId: post.event.id, relays: post.relays, results: post.results };
    console.log(`[VideoPoster] Posted Nostr note ${post.event.id}`);
  } catch (e) {
    res.error = String(e?.message || e);
    if (DEBUG) res.stack = String(e?.stack || '');
    console.error('[VideoPoster] Error:', res.error);
  }
  try {
    fs.writeFileSync(resultsPath, JSON.stringify(res, null, 2), 'utf8');
    console.log(`[VideoPoster] Results: ${resultsPath}`);
  } catch (e) {
    console.error('[VideoPoster] Failed to write results:', e);
  }
}

setInterval(checkForAiVideo, POLL_INTERVAL);
checkForAiVideo();

process.on('SIGINT', () => { console.log('\n[VideoPoster] Shutting down...'); process.exit(0); });
process.on('SIGTERM', () => { console.log('[VideoPoster] Shutting down...'); process.exit(0); });
