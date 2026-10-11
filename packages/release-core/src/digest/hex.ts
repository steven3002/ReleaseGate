const HEX_DIGITS = '0123456789abcdef';

export type HexDecoding =
  | { readonly ok: true; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly reason: 'odd-length' }
  | { readonly ok: false; readonly reason: 'invalid-character'; readonly index: number };

/** Lowercase hexadecimal, two digits per byte, no prefix. */
export function encodeHex(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) {
    text += HEX_DIGITS.charAt(byte >> 4) + HEX_DIGITS.charAt(byte & 0x0f);
  }
  return text;
}

/**
 * Accepts digits of either case and nothing else: no prefix, whitespace or separator.
 * A malformed string yields a failure and never a partially decoded value.
 */
export function decodeHex(text: string): HexDecoding {
  if (text.length % 2 !== 0) {
    return { ok: false, reason: 'odd-length' };
  }
  const bytes = new Uint8Array(text.length / 2);
  for (let index = 0; index < text.length; index += 2) {
    const high = digitValue(text.charCodeAt(index));
    if (high < 0) {
      return { ok: false, reason: 'invalid-character', index };
    }
    const low = digitValue(text.charCodeAt(index + 1));
    if (low < 0) {
      return { ok: false, reason: 'invalid-character', index: index + 1 };
    }
    bytes[index / 2] = (high << 4) | low;
  }
  return { ok: true, bytes };
}

function digitValue(charCode: number): number {
  if (charCode >= 0x30 && charCode <= 0x39) {
    return charCode - 0x30;
  }
  if (charCode >= 0x61 && charCode <= 0x66) {
    return charCode - 0x61 + 10;
  }
  if (charCode >= 0x41 && charCode <= 0x46) {
    return charCode - 0x41 + 10;
  }
  return -1;
}
