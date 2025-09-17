// context_vm.js - ESM JavaScript version (no TS) for server runtime
import 'dotenv/config';
import { Client } from '@modelcontextprotocol/sdk/client';
import { NostrClientTransport, PrivateKeySigner, SimpleRelayPool } from '@contextvm/sdk';

const CRAIG_DAVID_PUBKEY = process.env.CVM_SERVER_PUBKEY || 'ce6ba07d0f2bba5eac5cc17dee0c7bf05761a410a70814c173e9a7e8f9ec4606';
const CLIENT_PRIVATE_KEY_HEX = process.env.CRAIG_DAVID || process.env.CLIENT_PRIVATE_KEY || '';
const CVM_DEBUG = process.env.CVM_DEBUG === '1' || process.env.CVM_DEBUG === 'true';

const DEFAULT_RELAYS = [
  'wss://relay.contextvm.org',
];
const RELAYS = (process.env.CVM_RELAYS?.split(',').map(s => s.trim()).filter(Boolean) || DEFAULT_RELAYS);

export class CraigDavidClient {
  constructor() {
    this.mcpClient = new Client({ name: 'cd-client', version: '0.1.0' });
    this.transport = null;
    this.connected = false;
  }

  async connect() {
    if (!CLIENT_PRIVATE_KEY_HEX) {
      throw new Error('Missing CRAIG_DAVID private key in .env (CRAIG_DAVID=hex)');
    }
    if (CVM_DEBUG) {
      console.log('[CVM] Using server pubkey:', CRAIG_DAVID_PUBKEY);
      console.log('[CVM] Using relays:', RELAYS.join(', '));
    }

    const signer = new PrivateKeySigner(CLIENT_PRIVATE_KEY_HEX);
    const clientPubkey = await signer.getPublicKey();
    if (CVM_DEBUG) console.log('[CVM] Client pubkey:', clientPubkey);

    const relayPool = new SimpleRelayPool(RELAYS);

    this.transport = new NostrClientTransport({
      signer,
      relayHandler: relayPool,
      serverPubkey: CRAIG_DAVID_PUBKEY,
    });

    if (CVM_DEBUG) console.log('[CVM] Connecting to Context VM...');
    await this.mcpClient.connect(this.transport);
    this.connected = true;

    if (CVM_DEBUG) {
      try {
        const tools = await this.mcpClient.listTools();
        console.log('[CVM] Tools:', (tools?.tools || []).map(t => t.name).join(', ') || '(none)');
      } catch (e) {
        console.warn('[CVM] listTools failed:', e);
      }
    }
  }

  async listTools() {
    if (!this.connected) throw new Error('Not connected to Craig David');
    return this.mcpClient.listTools();
  }

  async callTool(name, args) {
    if (!this.connected) throw new Error('Not connected to Craig David');
    if (CVM_DEBUG) console.log(`[CVM] Calling tool: ${name}`);
    const res = await this.mcpClient.callTool({ name, arguments: args });
    if (CVM_DEBUG) console.log('[CVM] Raw response:', JSON.stringify(res));
    return res;
  }

  async disconnect() {
    if (this.connected) {
      await this.mcpClient.close();
      this.connected = false;
      if (CVM_DEBUG) console.log('[CVM] Disconnected');
    }
  }
}

export async function withCraigDavid(fn) {
  const client = new CraigDavidClient();
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.disconnect();
  }
}
