#!/usr/bin/env node
// run-access-check.js - Standalone script to perform access check via Context VM
import 'dotenv/config';
import { withCraigDavid } from './context_vm.js';

// Usage: node run-access-check.js <npub> <token> [mode]
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: run-access-check.js <npub> <token> [mode]');
  process.exit(2);
}

const [npub, token, mode = 'redeem'] = args;

function safeOutput(obj) {
  try {
    process.stdout.write(JSON.stringify(obj));
  } catch (e) {
    // Fallback minimal output
    process.stdout.write('{"decision":"ACCESS_DENIED","reason":"serialization error"}');
  }
}

async function main() {
  try {
    const desiredTool = process.env.CVM_ACCESS_TOOL || 'cashu_access';
    let toolToUse = desiredTool;

    // Discover tools
    const tools = await withCraigDavid(async (c) => c.listTools());
    const list = (tools?.tools || []).map(t => t.name);
    const available = new Set(list);

    if (!available.has(toolToUse)) {
      // Try to guess an appropriate tool
      const guess = list.find(n => /cashu_access|cashu|redeem|access|auth|check/i.test(n));
      if (guess) toolToUse = guess;
      else if (list[0]) toolToUse = list[0];
    }

    // Call tool
    const rawText = await withCraigDavid(async (c) => {
      // Per cvm server API, cashu_access expects only { encodedToken }
      const args = toolToUse === 'cashu_access' ? { encodedToken: token } : { encodedToken: token };
      const res = await c.callTool(toolToUse, args, { onProgress: () => {} });
      const text = res?.content?.[0]?.text || JSON.stringify(res);
      return text;
    });

    // Expect JSON like examples; attempt to parse, fallback with deny
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = { decision: 'ACCESS_DENIED', reason: 'invalid VM response', raw: rawText };
    }

    // Normalize fields
    const out = {
      decision: parsed.decision || 'ACCESS_DENIED',
      amount: parsed.amount ?? null,
      reason: parsed.reason || (parsed.decision ? undefined : 'unknown'),
      mintUrl: parsed.mintUrl || parsed.mint || undefined,
      mode: parsed.mode || 'redeem',
    };

    safeOutput(out);
    process.exit(0);
  } catch (e) {
    safeOutput({ decision: 'ACCESS_DENIED', reason: String(e), mode });
    process.exit(1);
  }
}

main();
