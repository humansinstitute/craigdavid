import { nip19 } from "nostr-tools";

export function decodeToHex(input: string): string | undefined {
  const hexRe = /^[0-9a-f]{64}$/i;
  try {
    const d = nip19.decode(input.trim());
    if (d.type === "npub" && typeof d.data === "string") return d.data;
  } catch {}
  if (hexRe.test(input.trim())) return input.trim().toLowerCase();
  return undefined;
}
