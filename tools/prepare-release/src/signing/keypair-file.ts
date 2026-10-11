import * as fs from 'node:fs/promises';
import { Keypair } from '@solana/web3.js';

export async function loadKeypairFile(filePath: string): Promise<Keypair> {
  const content = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(content) as unknown;
  if (!Array.isArray(parsed) || parsed.length !== 64) {
    throw new Error(`Invalid keypair file at ${filePath}: expected 64-byte array`);
  }
  return Keypair.fromSecretKey(Uint8Array.from(parsed as number[]));
}
