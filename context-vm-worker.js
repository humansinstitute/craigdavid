// context-vm-worker.js - Worker process for Context VM calls
import 'dotenv/config';
import { withCraigDavid } from './context_vm.js';

// Listen for messages from parent process
process.on('message', async (msg) => {
  if (msg.type === 'PROCESS_CONTENT') {
    try {
      const { justText, npub, toolName = 'summarise' } = msg.data;
      
      // Process each day's content
      const vmResults = [];
      
      // First, check available tools
      try {
        const tools = await withCraigDavid(async (c) => c.listTools());
        const available = new Set((tools?.tools || []).map(t => t.name));
        
        if (!available.has(toolName)) {
          const first = (tools?.tools || [])[0]?.name;
          if (first) {
            console.log(`[Worker] Using fallback tool: ${first}`);
            msg.data.toolName = first;
          }
        }
      } catch (e) {
        console.error('[Worker] listTools failed:', e.message);
      }
      
      // Process each day
      for (const jt of justText) {
        const question = `Please analyse and summarize the following daily content for ${npub} (day ${jt.filename.replace('-events.json','')}): ${jt.content}`;
        try {
          const vmResp = await withCraigDavid(async (c) => {
            const result = await c.callTool(msg.data.toolName || toolName, { question });
            const text = result?.content?.[0]?.text || JSON.stringify(result);
            return text;
          });
          vmResults.push({ dayFile: jt.filename, tool: msg.data.toolName || toolName, response: vmResp });
        } catch (e) {
          vmResults.push({ dayFile: jt.filename, tool: msg.data.toolName || toolName, error: String(e) });
        }
      }
      
      // Send results back to parent
      process.send({
        type: 'RESULT',
        data: {
          success: true,
          vmResults,
          summary: {
            successful: vmResults.filter(r => r.response).length,
            failed: vmResults.filter(r => r.error).length
          }
        }
      });
      
    } catch (error) {
      process.send({
        type: 'RESULT',
        data: {
          success: false,
          error: error.message
        }
      });
    }
  }
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Worker] Shutting down...');
  process.exit(0);
});

console.log('[Worker] Context VM worker started and ready');