// server.js (Node 18+ ESM)
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const buildDir = path.join(__dirname, process.env.SPA_BUILD_DIR || 'dist');

app.use('/assets', express.static(path.join(buildDir, 'assets'), {
  immutable: true,
  maxAge: '1y'
}));

app.use(express.static(buildDir, { maxAge: '1h' }));

app.get('/healthz', (req, res) => res.status(200).send('ok'));

const nip19Route = '/:id(npub1[0-9a-z]+|nprofile1[0-9a-z]+|nevent1[0-9a-z]+|note1[0-9a-z]+|naddr1[0-9a-z]+)';
app.get(nip19Route, (_req, res) => {
  res.sendFile(path.join(buildDir, 'index.html'));
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(buildDir, 'index.html'));
});

const port = 3080;
app.listen(port, () => console.log(`CRAIG server listening on :${port}`));
