import { sha256 as nobleSha256 } from '@noble/hashes/sha2';
import { encodeHex } from './hex';

/** Computes the raw 32-byte SHA-256 digest over the input bytes. */
export function sha256Bytes(bytes: Uint8Array): Uint8Array {
  return nobleSha256(bytes);
}

/**
 * Literal SHA-256 digest formatted as a 64-character lowercase hexadecimal string.
 * Used for artifact identity, manifest bindings, and storage indexing.
 */
export function sha256(bytes: Uint8Array): string {
  return encodeHex(sha256Bytes(bytes));
}
