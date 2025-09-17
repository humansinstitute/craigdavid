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

app.use('/assets', express.static(path.join(buildDir, 'assets'), { immutable: true, maxAge: '1y' }));
app.use(express.static(buildDir, { index: false, fallthrough: true, maxAge: '1h' }));

app.get('/healthz', (_req, res) => res.status(200).send('ok'));

// API: export currently displayed events to output/<npub>/events.json
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
    const outFile = path.join(outDir, 'events.json');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(events, null, 2), 'utf8');
    return res.json({ ok: true, path: outFile });
  } catch (e) {
    console.error('export-events failed', e);
    return res.status(500).json({ error: 'Failed to export events' });
  }
});

// API: summary of events (from body or file)
app.post('/api/summary', (req, res) => {
  try {
    const { user, events } = req.body || {};
    if (typeof user !== 'string' || !/^npub1[0-9a-z]+$/.test(user)) {
      return res.status(400).json({ error: 'Invalid user (must be npub)' });
    }
    let list = Array.isArray(events) ? events : (() => {
      try {
        const p = path.join(__dirname, 'output', user, 'events.json');
        return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : [];
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
