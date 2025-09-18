// Direct test of the problematic server code
import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testServerFlow() {
  console.log('Testing server Context VM flow...');
  
  const npub = 'npub12guhgpnn700zd02jf052yc0c9pnz7jadnyasfe6ss22scq0ycxtqudypta';
  const outDir = path.join(__dirname, 'output', npub);
  const justTextPath = path.join(outDir, 'just_text.json');
  
  const justText = JSON.parse(fs.readFileSync(justTextPath, 'utf8'));
  console.log('justText:', justText);
  
  const written = [{file: path.join(outDir, '240917-events.json'), count: 1, day: '240917'}];
  const pathCompat = written.length ? written[0].file : null;
  
  console.log('[CVM] Starting Context VM integration...');
  const vmResults = [];
  
  try {
    console.log('Importing context_vm.js from:', path.join(__dirname, 'context_vm.js'));
    const module = await import(path.join(__dirname, 'context_vm.js'));
    console.log('Module imported, keys:', Object.keys(module));
    const { withCraigDavid } = module;
    console.log('[CVM] Successfully imported withCraigDavid function');
    
    console.log(`[CVM] Found ${justText.length} days of content to process`);
    if (justText.length === 0) {
      console.warn('[CVM] No daily content (just_text empty). Skipping Context VM calls.');
      return;
    }
    
    // Test connection
    let toolName = 'funny_agent';
    console.log(`[CVM] Testing connection and discovering tools...`);
    const tools = await withCraigDavid(async (c) => c.listTools());
    console.log('Tools response:', tools);
    
    // Process content
    for (const jt of justText) {
      console.log(`[CVM] Processing day: ${jt.filename}`);
      const question = `Please analyse: ${jt.content}`;
      const vmResp = await withCraigDavid(async (c) => {
        const result = await c.callTool(toolName, { question });
        return result?.content?.[0]?.text || JSON.stringify(result);
      });
      console.log(`[CVM] Success:`, vmResp);
      vmResults.push({ dayFile: jt.filename, tool: toolName, response: vmResp });
    }
    
    console.log('[CVM] Complete! Results:', vmResults);
  } catch (e) {
    console.error('[CVM] ERROR:', e.message);
    console.error('[CVM] Stack:', e.stack);
  }
}

testServerFlow().catch(console.error);
