export type Leb128Decoding =
  | { readonly ok: true; readonly value: bigint; readonly bytesRead: number }
  | { readonly ok: false; readonly reason: string };

/**
 * Encodes an unsigned integer into canonical unsigned LEB128.
 */
export function encodeLeb128(value: number | bigint): Uint8Array {
  let v = BigInt(value);
  if (v < 0n) {
    throw new Error(`LEB128 value cannot be negative: ${v}`);
  }
  const bytes: number[] = [];
  while (v >= 128n) {
    bytes.push(Number((v & 127n) | 128n));
    v >>= 7n;
  }
  bytes.push(Number(v & 127n));
  return new Uint8Array(bytes);
}

/**
 * Decodes a canonical unsigned LEB128 integer from data at the specified offset.
 * Rejects non-canonical encodings, truncated inputs, and values overflowing 64 bits.
 */
export function decodeLeb128(data: Uint8Array, offset = 0): Leb128Decoding {
  let result = 0n;
  let shift = 0n;
  let bytesRead = 0;

  while (offset + bytesRead < data.length) {
    if (bytesRead >= 10) {
      return { ok: false, reason: 'LEB128 integer overflow (exceeds 10 bytes for u64)' };
    }
    const byte = data[offset + bytesRead]!;
    bytesRead++;
    const val = BigInt(byte & 0x7f);

    if (shift >= 63n && val > 1n) {
      return { ok: false, reason: 'LEB128 value overflows 64-bit unsigned integer' };
    }

    result |= val << shift;

    if ((byte & 0x80) === 0) {
      if (bytesRead > 1 && byte === 0x00) {
        return { ok: false, reason: 'Non-canonical LEB128 encoding: trailing zero byte' };
      }
      return { ok: true, value: result, bytesRead };
    }
    shift += 7n;
  }

  return { ok: false, reason: 'Truncated LEB128 sequence' };
}
