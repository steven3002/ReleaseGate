import { sha256 } from './sha256';

/**
 * Strips all trailing zero bytes (0x00) from the input buffer.
 * If the input buffer contains only zeros or is empty, returns an empty Uint8Array.
 */
export function stripTrailingZeros(bytes: Uint8Array): Uint8Array {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) {
    end--;
  }
  return bytes.subarray(0, end);
}

/**
 * Computes the verified-build SHA-256 digest per solana-verify convention:
 * strips all trailing zero bytes before computing SHA-256 over the payload.
 */
export function verifiedBuildSha256(bytes: Uint8Array): string {
  return sha256(stripTrailingZeros(bytes));
}
