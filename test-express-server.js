import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json({ limit: '10mb' }));

app.post('/api/test-cvm', async (req, res) => {
  try {
    console.log('[TEST] Starting test endpoint...');
    
    // Import Context VM
    const { withCraigDavid } = await import('./context_vm.js');
    console.log('[TEST] Imported withCraigDavid');
    
    // Test it
    const tools = await withCraigDavid(async (c) => c.listTools());
    console.log('[TEST] Got tools:', tools?.tools?.map(t => t.name));
    
    res.json({ success: true, tools: tools?.tools?.map(t => t.name) });
  } catch (e) {
    console.error('[TEST] Error:', e);
    res.status(500).json({ error: e.message });
  }
});

const port = 3081;
app.listen(port, () => console.log(`Test server on :${port}`));
