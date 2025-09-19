// server.js (Node 18+ ESM)
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import { Readable } from 'stream';
import { spawn } from 'child_process';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));

const buildDir = path.join(__dirname, process.env.SPA_BUILD_DIR || 'dist');
const indexFile = path.join(buildDir, 'index.html');

app.disable('x-powered-by');

// API: access-check using Context VM (spawned in a subprocess to avoid stdio interference)
app.post('/api/access-check', async (req, res) => {
  try {
    const { npub, token, mode } = req.body || {};
    if (typeof npub !== 'string' || !/^npub1[0-9a-z]+$/.test(npub)) {
      return res.status(400).json({ error: 'Invalid npub' });
    }
    if (typeof token !== 'string' || !token.startsWith('cashu')) {
      return res.status(400).json({ error: 'Invalid or missing Cashu token (must start with "cashu")' });
    }

    const script = path.join(__dirname, 'run-access-check.js');
    const child = spawn(process.execPath, [script, npub, token, mode || 'redeem'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (err += d.toString()));
    child.on('error', (e) => {
      return res.status(500).json({ error: 'failed to start access check', details: String(e) });
    });
    child.on('close', (_code) => {
      try {
        const parsed = JSON.parse(out || '{}');
        return res.json(parsed);
      } catch (e) {
        return res.status(502).json({ error: 'invalid access-check output', stdout: out, stderr: err });
      }
    });
  } catch (e) {
    return res.status(500).json({ error: 'access-check failed' });
  }
});

// API: export events by day into output/<npub>/<YYMMDD>-events.json
app.post('/api/export-events', async (req, res) => {
  try {
    const { npub, events, token } = req.body || {};
    if (typeof npub !== 'string' || !/^npub1[0-9a-z]+$/.test(npub)) {
      return res.status(400).json({ error: 'Invalid npub' });
    }
    if (!Array.isArray(events)) {
      return res.status(400).json({ error: 'Invalid events array' });
    }
    if (typeof token !== 'string' || !token.startsWith('cashu')) {
      return res.status(400).json({ error: 'Invalid or missing Cashu token (must start with "cashu")' });
    }

    const outDir = path.join(__dirname, 'output', npub);
    fs.mkdirSync(outDir, { recursive: true });

    // Save token as text file under output/tokens
    try {
      const tokensDir = path.join(__dirname, 'output', 'tokens');
      fs.mkdirSync(tokensDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const tokenFile = path.join(tokensDir, `${npub}-${ts}.txt`);
      fs.writeFileSync(tokenFile, token + '\n', 'utf8');
    } catch (e) {
      console.warn('Failed to persist Cashu token', e);
    }

    // Only export kind 1 events
    const source = events.filter(e => Number(e?.kind) === 1);

    // Group events by UTC day (YYMMDD) based on created_at
    const buckets = new Map(); // key -> array
    for (const e of source) {
      const t = e && e.created_at;
      const tn = typeof t === 'number' ? t : (typeof t === 'string' ? Number(t) : NaN);
      if (!Number.isFinite(tn)) continue; // skip invalid
      const d = new Date(tn * 1000);
      const y = String(d.getUTCFullYear()).slice(-2);
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      const key = `${y}${m}${day}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(e);
    }

    // Write each bucket to <YYMMDD>-events.json
    const written = [];
    for (const [key, list] of buckets) {
      // Sort by created_at ascending for determinism
      list.sort((a, b) => {
        const ta = Number(a?.created_at) || 0;
        const tb = Number(b?.created_at) || 0;
        return ta - tb;
      });
      const outFile = path.join(outDir, `${key}-events.json`);
      fs.writeFileSync(outFile, JSON.stringify(list, null, 2), 'utf8');
      written.push({ file: outFile, count: list.length, day: key });
    }

    // After export: read each JSON file, log concatenated content text, and write just_text.json
    const justText = [];
    for (const w of written) {
      try {
        const raw = fs.readFileSync(w.file, 'utf8');
        const arr = JSON.parse(raw);
        const texts = Array.isArray(arr)
          ? arr.map(e => (typeof e?.content === 'string' ? e.content.trim() : ''))
               .filter(s => s.length > 0)
          : [];
        const normalized = texts.map(t => /[.!?]$/.test(t) ? t : t + '.');
        const joined = normalized.join(' ');
        // extract day’s author hex if consistent across events
        let pubkey = undefined;
        if (Array.isArray(arr) && arr.length > 0) {
          const p0 = arr[0]?.pubkey;
          if (typeof p0 === 'string' && p0.length === 64) {
            const allSame = arr.every(ev => ev?.pubkey === p0);
            if (allSame) pubkey = p0.toLowerCase();
          }
        }
        console.log(`[just_text] ${path.basename(w.file)} -> ${joined}`);
        justText.push({ filename: path.basename(w.file), content: joined, pubkey });
      } catch (e) {
        console.warn('Failed to build just_text for', w.file, e);
      }
    }
    const justTextPath = path.join(outDir, 'just_text.json');
    fs.writeFileSync(justTextPath, JSON.stringify(justText, null, 2), 'utf8');

    // Kick off media prefetch for montage (non-blocking)
    try {
      prefetchMediaForMontage(npub, events).catch((e) => {
        console.warn('prefetchMediaForMontage error:', e);
      });
    } catch (e) {
      console.warn('Failed to start media prefetch task:', e);
    }

    // Back-compat: include `path` of first file if present
    const pathCompat = written.length ? written[0].file : null;

    // Context VM processing is now handled by the file watcher service (context-vm-watcher.js)
    // The watcher monitors for just_text.json and automatically processes it
    
    return res.json({ 
      ok: true, 
      files: written, 
      path: pathCompat, 
      just_text_path: justTextPath, 
      just_text_count: justText.length,
      note: 'Context VM processing will be handled automatically by the watcher service'
    });
  } catch (e) {
    console.error('export-events failed', e);
    return res.status(500).json({ error: 'Failed to export events' });
  }
});

app.use('/assets', express.static(path.join(buildDir, 'assets'), { immutable: true, maxAge: '1y' }));
app.use(express.static(buildDir, { index: false, fallthrough: true, maxAge: '1h' }));

app.get('/healthz', (_req, res) => res.status(200).send('ok'));



// API: summary of events (from body or daily files)
app.post('/api/summary', (req, res) => {
  try {
    const { user, events } = req.body || {};
    if (typeof user !== 'string' || !/^npub1[0-9a-z]+$/.test(user)) {
      return res.status(400).json({ error: 'Invalid user (must be npub)' });
    }
    let list = Array.isArray(events) ? events : (() => {
      try {
        const dir = path.join(__dirname, 'output', user);
        const daily = fs.existsSync(dir)
          ? fs.readdirSync(dir).filter(f => /^\d{6}-events\.json$/.test(f)).sort()
          : [];
        if (daily.length > 0) {
          const all = [];
          for (const f of daily) {
            try {
              const p = path.join(dir, f);
              const part = JSON.parse(fs.readFileSync(p, 'utf8'));
              if (Array.isArray(part)) all.push(...part);
            } catch {}
          }
          return all;
        }
        // Fallback to legacy single file
        const legacy = path.join(dir, 'events.json');
        return fs.existsSync(legacy) ? JSON.parse(fs.readFileSync(legacy, 'utf8')) : [];
      } catch {
        return [];
      }
    })();

    const kinds = {};
    let min = null, max = null;
    const authors = new Set();

    for (const e of list) {
      const k = e && e.kind;
      const kk = k != null ? String(k) : null;
      if (kk) kinds[kk] = (kinds[kk] || 0) + 1;

      const t = e && e.created_at;
      const tn = typeof t === 'number' ? t : (typeof t === 'string' ? Number(t) : NaN);
      if (Number.isFinite(tn)) {
        min = min === null ? tn : Math.min(min, tn);
        max = max === null ? tn : Math.max(max, tn);
      }

      const a = e && (e.pubkey || e.author || e.npub || e.user);
      if (typeof a === 'string' && a) authors.add(a);
    }

    const summary = {
      total: list.length,
      kinds,
      timeRange: { min, max },
      authors: { total: authors.size },
    };

    return res.json({ ok: true, summary });
  } catch (e) {
    console.error('summary failed', e);
    return res.status(500).json({ error: 'Failed to compute summary' });
  }
});

function serveIndex(_req, res) {
  if (!fs.existsSync(indexFile)) {
    return res.status(404).send('index.html not found. Did you run the build?');
  }
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  return res.sendFile(indexFile);
}

const nip19Regexes = [
  /^\/npub1[0-9a-z]+(?:\/.*)?$/,
  /^\/nprofile1[0-9a-z]+(?:\/.*)?$/,
  /^\/nevent1[0-9a-z]+(?:\/.*)?$/,
  /^\/note1[0-9a-z]+(?:\/.*)?$/,
  /^\/naddr1[0-9a-z]+(?:\/.*)?$/,
];
app.get(nip19Regexes, serveIndex);

// Express 5 safe catch-all
app.get(/(.*)/, serveIndex);

const port = 3080;
app.listen(port, () => console.log(`CRAIG server listening on :${port}`));

// ------------------ Montage media prefetch helpers ------------------
const MAX_MEDIA_BYTES = (Number(process.env.PREFETCH_MAX_MEDIA_MB || 50) || 50) * 1024 * 1024; // MB
const MEDIA_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', '.webm', '.mkv']);

function extractUrlsFromEvents(events) {
  const urls = new Set();
  const urlRe = /https?:\/\/[^\s<>"'()\[\]]+/gi;
  for (const e of Array.isArray(events) ? events : []) {
    // content URLs
    const c = typeof e?.content === 'string' ? e.content : '';
    if (c) {
      const matches = c.match(urlRe) || [];
      for (let u of matches) {
        u = u.replace(/[)>"'\]]+$/, '');
        urls.add(u);
      }
    }
    // tags URLs (common patterns: 'r', 'url', 'imeta')
    const tags = Array.isArray(e?.tags) ? e.tags : [];
    for (const t of tags) {
      if (!Array.isArray(t) || t.length < 2) continue;
      for (const part of t.slice(1)) {
        if (typeof part === 'string' && /^https?:\/\//i.test(part)) {
          urls.add(part);
        }
      }
    }
  }
  return Array.from(urls);
}

function urlLooksLikeMedia(u) {
  try {
    const ext = path.extname(new URL(u).pathname).toLowerCase();
    if (MEDIA_EXTS.has(ext)) return true;
  } catch {}
  return false; // may still be media; Content-Type check later
}

function safeBasenameFromUrl(u, fallbackExt = '') {
  try {
    const url = new URL(u);
    const name = path.basename(url.pathname) || crypto.createHash('sha1').update(u).digest('hex');
    return name;
  } catch {
    return crypto.createHash('sha1').update(u).digest('hex') + fallbackExt;
  }
}

async function fetchHead(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r;
  } catch {
    return null;
  }
}

async function downloadWithLimit(url, destPath) {
  // Pre-check via HEAD for size and type if available
  const head = await fetchHead(url);
  let contentLength = undefined;
  let contentType = undefined;
  if (head && head.ok) {
    contentType = head.headers.get('content-type') || undefined;
    const len = head.headers.get('content-length');
    if (len && Number.isFinite(Number(len))) contentLength = Number(len);
    if (contentLength != null && contentLength > MAX_MEDIA_BYTES) {
      const reason = `too large (${contentLength} bytes)`;
      console.log(`[prefetch] Skip ${reason}: ${url}`);
      return { ok: false, reason, contentLength, contentType };
    }
    if (contentType && !/^image\//i.test(contentType) && !/^video\//i.test(contentType)) {
      // Continue anyway; some servers HEAD lie. We'll re-evaluate during GET
    }
  }

  const res = await fetch(url);
  if (!res.ok || !res.body) {
    const reason = `GET ${res.status}`;
    console.log(`[prefetch] GET failed: ${url} -> ${res.status}`);
    return { ok: false, reason, contentLength, contentType };
  }

  // Choose extension based on content-type if missing
  let finalPath = destPath;
  const ct = res.headers.get('content-type') || contentType || '';
  const isMediaType = /^image\//i.test(ct) || /^video\//i.test(ct);
  if (!isMediaType && !urlLooksLikeMedia(url)) {
    const reason = `non-media content-type: ${ct || 'unknown'}`;
    console.log(`[prefetch] Skip (${reason}): ${url}`);
    return { ok: false, reason, contentLength, contentType: ct };
  }
  let ext = path.extname(destPath);
  if (!ext) {
    if (/image\/jpeg/i.test(ct)) ext = '.jpg';
    else if (/image\/png/i.test(ct)) ext = '.png';
    else if (/image\/gif/i.test(ct)) ext = '.gif';
    else if (/image\/webp/i.test(ct)) ext = '.webp';
    else if (/video\/mp4/i.test(ct)) ext = '.mp4';
    else if (/video\/webm/i.test(ct)) ext = '.webm';
    else if (/video\/quicktime/i.test(ct)) ext = '.mov';
    if (ext) finalPath = destPath + ext;
  }

  // Stream to file with size limit (convert WHATWG stream to Node stream if needed)
  const bodyStream = (res.body && typeof res.body.getReader === 'function')
    ? Readable.fromWeb(res.body)
    : res.body;

  let total = 0;
  await new Promise(async (resolve, reject) => {
    const file = fs.createWriteStream(finalPath);
    bodyStream.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_MEDIA_BYTES) {
        bodyStream.destroy(new Error('File exceeds 50MB limit'));
      }
    });
    bodyStream.on('error', (err) => {
      try { file.destroy(); fs.unlinkSync(finalPath); } catch {}
      reject(err);
    });
    file.on('error', (err) => {
      try { file.destroy(); fs.unlinkSync(finalPath); } catch {}
      reject(err);
    });
    file.on('finish', resolve);
    bodyStream.pipe(file);
  });

  console.log('[prefetch] Saved', finalPath);
  return { ok: true, path: finalPath, bytes: total, contentType: ct, contentLength };
}

async function prefetchMediaForMontage(npub, events) {
  const npubDir = path.join(__dirname, 'output', npub);
  const montageDir = path.join(npubDir, 'montage');
  fs.mkdirSync(montageDir, { recursive: true });

  const links = extractUrlsFromEvents(events);
  // Process all discovered links; filtering happens via HEAD/GET media checks
  const candidates = links;

  // Persist events.json with links
  const eventsJsonPath = path.join(montageDir, 'events.json');
  const payload = { sourceCount: Array.isArray(events) ? events.length : 0, linkCount: candidates.length, links: candidates };
  fs.writeFileSync(eventsJsonPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`[prefetch] Wrote ${eventsJsonPath} (${candidates.length} links)`);

  // Start downloads sequentially with small concurrency
  const concurrency = 3;
  const queue = candidates.slice();
  const results = [];
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const url = queue.shift();
      if (!url) break;
      try {
        const base = safeBasenameFromUrl(url);
        let dest = path.join(montageDir, base);
        // Avoid overwriting existing
        if (fs.existsSync(dest)) {
          const alt = crypto.createHash('sha1').update(url).digest('hex');
          dest = path.join(montageDir, alt);
        }
        const r = await downloadWithLimit(url, dest);
        results.push({ url, ...r });
      } catch (e) {
        console.log('[prefetch] Failed', url, e?.message || e);
        results.push({ url, ok: false, reason: e?.message || 'error' });
      }
    }
  });
  await Promise.all(workers);
  // Persist prefetch status
  try {
    const status = { completedAt: new Date().toISOString(), maxBytes: MAX_MEDIA_BYTES, results };
    fs.writeFileSync(path.join(montageDir, 'prefetch.json'), JSON.stringify(status, null, 2), 'utf8');
  } catch {}
}
