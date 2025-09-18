#!/usr/bin/env node
// context-vm-watcher.js - File watcher service for automatic Context VM processing
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { withCraigDavid } from './context_vm.js';
import { nip19 } from 'nostr-tools';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.join(__dirname, 'output');
const POLL_INTERVAL = 2000; // Check every 2 seconds
const PROCESSING_DELAY = 1000; // Wait 1 second after file detection before processing

// Keep track of processed files to avoid reprocessing
const processedFiles = new Set();

// Startup timestamp - only process files modified after this time
const STARTUP_TIME = Date.now();

console.log('[Watcher] Context VM file watcher started');
console.log(`[Watcher] Startup time: ${new Date(STARTUP_TIME).toISOString()}`);
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
    
    // Resolve subject hex (preferred from folder npub, fallback from just_text entries if present)
    let subjectHex;
    try {
      const decoded = nip19.decode(npub);
      if (decoded.type === 'npub' && typeof decoded.data === 'string') subjectHex = decoded.data;
    } catch {}
    if (!subjectHex) {
      const candidate = justText.find(jt => typeof jt?.pubkey === 'string' && jt.pubkey.length === 64)?.pubkey;
      if (candidate) subjectHex = candidate.toLowerCase();
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
          const res = await c.callTool(actualToolName, { dayInput: question, pubkey: subjectHex });
          const text = res?.content?.[0]?.text || JSON.stringify(res);
          return text;
        });
        
        console.log(`[Watcher] ✓ Success for ${jt.filename}`);
        
        // Parse structured response to extract eventID
        let parsedResponse;
        let eventID = null;
        try {
          parsedResponse = JSON.parse(vmResp);
          eventID = parsedResponse.eventID || null;
        } catch (e) {
          // If parsing fails, treat as plain text response
          parsedResponse = { summary: vmResp, eventID: null, published: false };
        }
        
        vmResults.push({ 
          dayFile: jt.filename, 
          tool: actualToolName, 
          response: parsedResponse.summary || vmResp,
          eventID: eventID
        });
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

async function processWeeklySong(npub, vmResultsPath) {
  const cacheKey = `${npub}:${vmResultsPath}:weekly`;
  if (processedFiles.has(cacheKey)) return;

  // Avoid reprocessing if weekly output already exists
  const weeklyOutPath = path.join(path.dirname(vmResultsPath), 'weekly_vm_results.json');
  if (fs.existsSync(weeklyOutPath)) {
    processedFiles.add(cacheKey);
    return;
  }

  console.log(`[Watcher] Processing ${npub}/vm_results.json for weekly song`);
  processedFiles.add(cacheKey);

  try {
    const vmResults = JSON.parse(fs.readFileSync(vmResultsPath, 'utf8'));
    if ((!Array.isArray(vmResults) && typeof vmResults !== 'object') || (Array.isArray(vmResults) && vmResults.length === 0)) {
      console.log(`[Watcher] Empty vm_results.json for ${npub}, skipping weekly song`);
      return;
    }

    // Determine subject hex from npub folder name
    let subjectHex = undefined;
    try {
      const decoded = nip19.decode(npub);
      if (decoded.type === 'npub' && typeof decoded.data === 'string') subjectHex = decoded.data;
    } catch {}

    if (!subjectHex) {
      console.warn(`[Watcher] Could not decode subject hex from ${npub}. Weekly tool may still work with npub.`);
    }

    const weeklyToolEnv = process.env.CVM_WEEKLY_TOOL || 'weekly_summary';
    let actualWeeklyTool = weeklyToolEnv;

    // Discover tools to confirm the weekly tool name
    try {
      const tools = await withCraigDavid(async (c) => c.listTools());
      const list = (tools?.tools || []).map(t => t.name);
      const available = new Set(list);
      console.log(`[Watcher] Available tools: ${list.join(', ')}`);

      if (!available.has(actualWeeklyTool)) {
        // Try to find a tool that looks like a weekly tool
        const guess = list.find(n => /weekly/i.test(n));
        if (guess) {
          actualWeeklyTool = guess;
          console.log(`[Watcher] Using guessed weekly tool: ${actualWeeklyTool}`);
        } else if (list[0]) {
          actualWeeklyTool = list[0];
          console.log(`[Watcher] Using fallback tool: ${actualWeeklyTool}`);
        }
      } else {
        console.log(`[Watcher] Using weekly tool: ${actualWeeklyTool}`);
      }
    } catch (e) {
      console.error('[Watcher] Failed to list tools for weekly song:', e.message);
    }

    // weeklyInput should be the raw stringified vm_results.json
    const weeklyInput = fs.readFileSync(vmResultsPath, 'utf8');

    let weeklyRespText;
    try {
      weeklyRespText = await withCraigDavid(async (c) => {
        const res = await c.callTool(actualWeeklyTool, { weeklyInput, pubkey: subjectHex });
        const text = res?.content?.[0]?.text || JSON.stringify(res);
        return text;
      });
    } catch (e) {
      console.error(`[Watcher] ✗ Weekly song failed for ${npub}:`, e.message);
      fs.writeFileSync(weeklyOutPath, JSON.stringify({ error: String(e), tool: actualWeeklyTool }, null, 2), 'utf8');
      return;
    }

    // Parse possible structured response
    let parsed;
    let eventID = null;
    try {
      parsed = JSON.parse(weeklyRespText);
      eventID = parsed.eventID || null;
    } catch {
      parsed = { summary: weeklyRespText, eventID: null, published: false };
    }

    const weeklyOut = {
      tool: actualWeeklyTool,
      subject: { npub, hex: subjectHex || null },
      response: parsed.summary || weeklyRespText,
      eventID,
    };

    fs.writeFileSync(weeklyOutPath, JSON.stringify(weeklyOut, null, 2), 'utf8');
    console.log(`[Watcher] ✓ Weekly song completed for ${npub}${eventID ? `, event ${eventID}` : ''}`);
    console.log(`[Watcher] Results written to: ${weeklyOutPath}`);
  } catch (e) {
    console.error(`[Watcher] Error processing weekly song for ${npub}:`, e);
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
    
    // Check each npub directory for just_text.json and vm_results.json
    for (const npub of dirs) {
      const npubDir = path.join(OUTPUT_DIR, npub);
      const justTextPath = path.join(npubDir, 'just_text.json');
      const vmResultsPathLower = path.join(npubDir, 'vm_results.json');
      const vmResultsPathUpper = path.join(npubDir, 'VM_results.json');
      const vmResultsPath = fs.existsSync(vmResultsPathLower)
        ? vmResultsPathLower
        : (fs.existsSync(vmResultsPathUpper) ? vmResultsPathUpper : null);
      
      // If just_text.json exists but vm_results.json doesn't, process it (only if modified after startup)
      if (fs.existsSync(justTextPath) && !vmResultsPath) {
        const justTextStat = fs.statSync(justTextPath);
        if (justTextStat.mtime.getTime() > STARTUP_TIME) {
          console.log(`[Watcher] Found new just_text.json for ${npub} (modified ${justTextStat.mtime.toISOString()})`);
          // Wait a bit to ensure file is fully written
          setTimeout(() => processJustText(npub, justTextPath), PROCESSING_DELAY);
        }
      }

      // If vm_results.json exists (lower/upper), trigger weekly song processing (once) (only if modified after startup)
      if (vmResultsPath) {
        const vmResultsStat = fs.statSync(vmResultsPath);
        if (vmResultsStat.mtime.getTime() > STARTUP_TIME) {
          console.log(`[Watcher] Found new vm_results.json for ${npub} (modified ${vmResultsStat.mtime.toISOString()})`);
          setTimeout(() => processWeeklySong(npub, vmResultsPath), PROCESSING_DELAY);
        }
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
