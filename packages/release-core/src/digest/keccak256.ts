import { keccak_256 } from '@noble/hashes/sha3';
import { encodeHex } from './hex';

/** Computes the raw 32-byte Keccak-256 digest over the input bytes. */
export function keccak256Bytes(bytes: Uint8Array): Uint8Array {
  return keccak_256(bytes);
}

/**
 * Literal Keccak-256 digest formatted as a 64-character lowercase hexadecimal string.
 * This matches the on-chain hash computation performed by Lighthouse VerifyDatahash.
 */
export function keccak256(bytes: Uint8Array): string {
  return encodeHex(keccak256Bytes(bytes));
}
