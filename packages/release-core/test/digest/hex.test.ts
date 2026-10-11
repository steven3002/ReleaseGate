import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { decodeHex, encodeHex } from '../../src/digest/hex';

describe('encodeHex', () => {
  it('writes two lowercase digits per byte', () => {
    assert.equal(encodeHex(Uint8Array.of(0x00, 0x0f, 0x10, 0xab, 0xff)), '000f10abff');
  });

  it('encodes an empty array as an empty string', () => {
    assert.equal(encodeHex(new Uint8Array(0)), '');
  });
});

describe('decodeHex', () => {
  it('reads digits of either case', () => {
    assert.deepEqual(decodeHex('000f10abFF'), {
      ok: true,
      bytes: Uint8Array.of(0x00, 0x0f, 0x10, 0xab, 0xff),
    });
  });

  it('decodes an empty string to an empty array', () => {
    assert.deepEqual(decodeHex(''), { ok: true, bytes: new Uint8Array(0) });
  });

  it('round-trips every byte value', () => {
    const every = Uint8Array.from({ length: 256 }, (_, value) => value);
    assert.deepEqual(decodeHex(encodeHex(every)), { ok: true, bytes: every });
  });

  it('rejects an odd number of digits', () => {
    assert.deepEqual(decodeHex('abc'), { ok: false, reason: 'odd-length' });
  });

  const malformed: readonly (readonly [text: string, index: number])[] = [
    ['zz', 0],
    ['0g', 1],
    ['0x00', 1],
    [' 00 ', 0],
    ['00:1', 2],
    ['00\n0', 2],
    ['００', 0],
  ];
  for (const [text, index] of malformed) {
    it(`reports the first invalid character of ${JSON.stringify(text)}`, () => {
      assert.deepEqual(decodeHex(text), { ok: false, reason: 'invalid-character', index });
    });
  }
});
