// server.js (Node 18+ ESM)
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));

const buildDir = path.join(__dirname, process.env.SPA_BUILD_DIR || 'dist');
const indexFile = path.join(buildDir, 'index.html');

app.disable('x-powered-by');

// API: export events by day into output/<npub>/<YYMMDD>-events.json
app.post('/api/export-events', (req, res) => {
  try {
    const { npub, events } = req.body || {};
    if (typeof npub !== 'string' || !/^npub1[0-9a-z]+$/.test(npub)) {
      return res.status(400).json({ error: 'Invalid npub' });
    }
    if (!Array.isArray(events)) {
      return res.status(400).json({ error: 'Invalid events array' });
    }

    const outDir = path.join(__dirname, 'output', npub);
    fs.mkdirSync(outDir, { recursive: true });

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
        console.log(`[just_text] ${path.basename(w.file)} -> ${joined}`);
        justText.push({ filename: path.basename(w.file), content: joined });
      } catch (e) {
        console.warn('Failed to build just_text for', w.file, e);
      }
    }
    const justTextPath = path.join(outDir, 'just_text.json');
    fs.writeFileSync(justTextPath, JSON.stringify(justText, null, 2), 'utf8');

    // Back-compat: include `path` of first file if present
    const pathCompat = written.length ? written[0].file : null;

    return res.json({ ok: true, files: written, path: pathCompat, just_text_path: justTextPath, just_text_count: justText.length });
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
