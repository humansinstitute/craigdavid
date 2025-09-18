#!/usr/bin/env node
// context-vm-watcher.js - File watcher service for automatic Context VM processing
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { withCraigDavid } from './context_vm.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.join(__dirname, 'output');
const POLL_INTERVAL = 2000; // Check every 2 seconds
const PROCESSING_DELAY = 1000; // Wait 1 second after file detection before processing

// Keep track of processed files to avoid reprocessing
const processedFiles = new Set();

console.log('[Watcher] Context VM file watcher started');
console.log(`[Watcher] Monitoring: ${OUTPUT_DIR}`);

async function processJustText(npub, justTextPath) {
  const cacheKey = `${npub}:${justTextPath}`;
  if (processedFiles.has(cacheKey)) {
    return; // Already processed
  }
  
  console.log(`[Watcher] Processing ${npub}/just_text.json`);
  processedFiles.add(cacheKey);
  
  try {
    const justText = JSON.parse(fs.readFileSync(justTextPath, 'utf8'));
    
    if (!justText || justText.length === 0) {
      console.log(`[Watcher] Empty just_text.json for ${npub}, skipping`);
      return;
    }
    
    const vmResults = [];
    const toolName = process.env.CVM_TOOL || 'summarise';
    
    // Check available tools once
    let actualToolName = toolName;
    try {
      const tools = await withCraigDavid(async (c) => c.listTools());
      const available = new Set((tools?.tools || []).map(t => t.name));
      console.log(`[Watcher] Available tools: ${[...available].join(', ')}`);
      
      if (!available.has(toolName)) {
        const first = (tools?.tools || [])[0]?.name;
        if (first) {
          actualToolName = first;
          console.log(`[Watcher] Using fallback tool: ${actualToolName}`);
        }
      } else {
        console.log(`[Watcher] Using tool: ${actualToolName}`);
      }
    } catch (e) {
      console.error('[Watcher] Failed to list tools:', e.message);
    }
    
    // Process each day's content
    for (const jt of justText) {
      console.log(`[Watcher] Processing ${jt.filename} (${jt.content.length} chars)`);
      const question = `Please analyse and summarize the following daily content for ${npub} (day ${jt.filename.replace('-events.json','')}): ${jt.content}`;
      
      try {
        const vmResp = await withCraigDavid(async (c) => {
          const result = await c.callTool(actualToolName, { dayInput: question });
          const text = result?.content?.[0]?.text || JSON.stringify(result);
          return text;
        });
        
        console.log(`[Watcher] ✓ Success for ${jt.filename}`);
        vmResults.push({ dayFile: jt.filename, tool: actualToolName, response: vmResp });
      } catch (e) {
        console.error(`[Watcher] ✗ Failed for ${jt.filename}:`, e.message);
        vmResults.push({ dayFile: jt.filename, tool: actualToolName, error: String(e) });
      }
    }
    
    // Write results
    const vmOutPath = path.join(path.dirname(justTextPath), 'vm_results.json');
    fs.writeFileSync(vmOutPath, JSON.stringify(vmResults, null, 2), 'utf8');
    
    const successful = vmResults.filter(r => r.response).length;
    const failed = vmResults.filter(r => r.error).length;
    console.log(`[Watcher] ✓ Completed ${npub}: ${successful} successful, ${failed} failed`);
    console.log(`[Watcher] Results written to: ${vmOutPath}`);
    
  } catch (e) {
    console.error(`[Watcher] Error processing ${npub}:`, e);
  }
}

function checkForNewFiles() {
  try {
    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      return;
    }
    
    // List all npub directories
    const dirs = fs.readdirSync(OUTPUT_DIR).filter(dir => {
      return dir.startsWith('npub') && fs.statSync(path.join(OUTPUT_DIR, dir)).isDirectory();
    });
    
    // Check each npub directory for just_text.json
    for (const npub of dirs) {
      const justTextPath = path.join(OUTPUT_DIR, npub, 'just_text.json');
      const vmResultsPath = path.join(OUTPUT_DIR, npub, 'vm_results.json');
      
      // If just_text.json exists but vm_results.json doesn't, process it
      if (fs.existsSync(justTextPath) && !fs.existsSync(vmResultsPath)) {
        // Wait a bit to ensure file is fully written
        setTimeout(() => processJustText(npub, justTextPath), PROCESSING_DELAY);
      }
    }
  } catch (e) {
    console.error('[Watcher] Error checking files:', e);
  }
}

// Start monitoring
setInterval(checkForNewFiles, POLL_INTERVAL);
checkForNewFiles(); // Initial check

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Watcher] Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[Watcher] Shutting down...');
  process.exit(0);
});

console.log('[Watcher] Watching for new just_text.json files...');