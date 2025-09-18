// Test Context VM integration directly
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { withCraigDavid } from './context_vm.js';

const justTextPath = 'output/npub12guhgpnn700zd02jf052yc0c9pnz7jadnyasfe6ss22scq0ycxtqudypta/just_text.json';

async function testCVM() {
  console.log('[CVM] Starting Context VM integration test...');
  
  if (!fs.existsSync(justTextPath)) {
    console.error('[CVM] just_text.json not found at:', justTextPath);
    return;
  }
  
  const justText = JSON.parse(fs.readFileSync(justTextPath, 'utf8'));
  console.log(`[CVM] Found ${justText.length} days of content to process`);
  
  if (justText.length === 0) {
    console.warn('[CVM] No daily content (just_text empty). Skipping Context VM calls.');
    return;
  }
  
  // Test connection first
  console.log(`[CVM] Testing connection and discovering tools...`);
  let toolName = 'summarise';
  try {
    const tools = await withCraigDavid(async (c) => c.listTools());
    const available = new Set((tools?.tools || []).map(t => t.name));
    console.log(`[CVM] ✓ Connection successful. Available tools: ${[...available].join(', ')}`);
    if (!available.has(toolName)) {
      const first = (tools?.tools || [])[0]?.name;
      console.warn(`[CVM] Preferred tool "${toolName}" not found. Available: ${[...available].join(', ')}`);
      if (first) {
        toolName = first;
        console.warn(`[CVM] Falling back to: ${toolName}`);
      }
    } else {
      console.log(`[CVM] ✓ Using tool: ${toolName}`);
    }
  } catch (e) {
    console.error('[CVM] ✗ Connection/listTools failed:', e.message);
    console.error('[CVM] Stack trace:', e.stack);
    return;
  }
  
  // Process each day
  const vmResults = [];
  console.log(`[CVM] Processing ${justText.length} days of content...`);
  for (const jt of justText) {
    console.log(`[CVM] Processing day: ${jt.filename} (content length: ${jt.content.length} chars)`);
    const question = `Please analyse and summarize the following daily content (day ${jt.filename.replace('-events.json','')}): ${jt.content}`;
    try {
      console.log(`[CVM] Calling tool ${toolName} for ${jt.filename}...`);
      const vmResp = await withCraigDavid(async (c) => {
        const result = await c.callTool(toolName, { dayInput: question });
        const text = result?.content?.[0]?.text || JSON.stringify(result);
        return text;
      });
      console.log(`[CVM] ✓ Success for ${jt.filename}: ${vmResp.substring(0, 100)}...`);
      vmResults.push({ dayFile: jt.filename, tool: toolName, response: vmResp });
    } catch (e) {
      console.error(`[CVM] ✗ Context VM call failed for ${jt.filename}:`, e.message);
      console.error(`[CVM] Stack trace for ${jt.filename}:`, e.stack);
      vmResults.push({ dayFile: jt.filename, tool: toolName, error: String(e) });
    }
  }
  
  const vmOutPath = path.dirname(justTextPath) + '/vm_results.json';
  fs.writeFileSync(vmOutPath, JSON.stringify(vmResults, null, 2), 'utf8');
  console.log(`[CVM] ✓ Completed Context VM processing. Results written to: ${vmOutPath}`);
  console.log(`[CVM] Summary: ${vmResults.filter(r => r.response).length} successful, ${vmResults.filter(r => r.error).length} failed`);
}

testCVM().catch(console.error);