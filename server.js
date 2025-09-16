// server.js (Node 18+ ESM)
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const buildDir = path.join(__dirname, process.env.SPA_BUILD_DIR || 'dist');
const indexFile = path.join(buildDir, 'index.html');

app.disable('x-powered-by');

app.use('/assets', express.static(path.join(buildDir, 'assets'), { immutable: true, maxAge: '1y' }));
app.use(express.static(buildDir, { index: false, fallthrough: true, maxAge: '1h' }));

app.get('/healthz', (_req, res) => res.status(200).send('ok'));

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
