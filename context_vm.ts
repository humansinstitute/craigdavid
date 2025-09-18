// context_vm.ts
import 'dotenv/config';
import { Client } from '@modelcontextprotocol/sdk/client';
import { NostrClientTransport, PrivateKeySigner, SimpleRelayPool } from '@contextvm/sdk';

const CRAIG_DAVID_PUBKEY = 'ce6ba07d0f2bba5eac5cc17dee0c7bf05761a410a70814c173e9a7e8f9ec4606';
const CLIENT_PRIVATE_KEY_HEX = process.env.CRAIG_DAVID || process.env.CLIENT_PRIVATE_KEY || '';

if (!CLIENT_PRIVATE_KEY_HEX) {
  console.error('Missing CRAIG_DAVID private key in .env (CRAIG_DAVID=hex)');
  process.exit(1);
}

const DEFAULT_RELAYS = [
  "wss://relay.contextvm.org",
];


const RELAYS = (process.env.CVM_RELAYS?.split(',').map(s => s.trim()).filter(Boolean) || DEFAULT_RELAYS);

export class CraigDavidClient {
  private mcpClient: Client;
  private transport!: NostrClientTransport;
  private connected = false;

  constructor() {
    this.mcpClient = new Client({ name: 'cd-client', version: '0.1.0' });
  }

  async connect(): Promise<void> {
    const signer = new PrivateKeySigner(CLIENT_PRIVATE_KEY_HEX);
    const relayPool = new SimpleRelayPool(RELAYS);

    this.transport = new NostrClientTransport({
      signer,
      relayHandler: relayPool,
      serverPubkey: CRAIG_DAVID_PUBKEY,
    });

    await this.mcpClient.connect(this.transport);
    this.connected = true;
  }

  async listTools(): Promise<any> {
    if (!this.connected) throw new Error('Not connected to Craig David');
    return this.mcpClient.listTools();
  }

  async callTool(name: string, args: Record<string, any>): Promise<any> {
    if (!this.connected) throw new Error('Not connected to Craig David');
    return this.mcpClient.callTool({ name, arguments: args });
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.mcpClient.close();
      this.connected = false;
    }
  }
}

// Reusable helper for single-shot use
export async function withCraigDavid<T>(fn: (c: CraigDavidClient) => Promise<T>): Promise<T> {
  const client = new CraigDavidClient();
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.disconnect();
  }
}
