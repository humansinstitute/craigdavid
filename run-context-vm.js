#!/usr/bin/env node
// run-context-vm.js - Standalone script to process Context VM requests
import 'dotenv/config';
import fs from 'fs';
import { withCraigDavid } from './context_vm.js';

const args = process.argv.slice(2);
if (args.length !== 3) {
  console.error('Usage: run-context-vm.js <justTextPath> <npub> <outputPath>');
  process.exit(1);
}

const [justTextPath, npub, outputPath] = args;

async function main() {
  try {
    const justText = JSON.parse(fs.readFileSync(justTextPath, 'utf8'));
    const toolName = process.env.CVM_TOOL || 'funny_agent';
    const vmResults = [];
    
    // Process each day
    for (const jt of justText) {
      const question = `Please analyse and summarize the following daily content for ${npub} (day ${jt.filename.replace('-events.json','')}): ${jt.content}`;
      try {
        const vmResp = await withCraigDavid(async (c) => {
          const result = await c.callTool(toolName, { question });
          return result?.content?.[0]?.text || JSON.stringify(result);
        });
        vmResults.push({ dayFile: jt.filename, tool: toolName, response: vmResp });
      } catch (e) {
        vmResults.push({ dayFile: jt.filename, tool: toolName, error: String(e) });
      }
    }
    
    fs.writeFileSync(outputPath, JSON.stringify(vmResults, null, 2), 'utf8');
    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    fs.writeFileSync(outputPath, JSON.stringify([], null, 2), 'utf8');
    process.exit(1);
  }
}

main();