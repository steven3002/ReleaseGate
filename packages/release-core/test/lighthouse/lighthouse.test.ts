import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decodeLeb128, encodeLeb128 } from '../../src/lighthouse/leb128';
import type { LighthouseAssertion } from '../../src/lighthouse/assertions';
import { encodeLighthouseAssertion } from '../../src/lighthouse/encode';
import { decodeLighthouseAssertion } from '../../src/lighthouse/decode';
import { LOADER_V3_PROGRAM_ID, LIGHTHOUSE_PROGRAM_ID } from '../../src/cluster/programs';
import { encodeHex } from '../../src/digest/hex';

describe('lighthouse LEB128 codec', () => {
  it('round-trips small, boundary, and large integers', () => {
    const testValues = [0n, 1n, 37n, 127n, 128n, 255n, 16383n, 16384n, 424248n, 2n ** 53n + 1n, 2n ** 64n - 1n];
    for (const val of testValues) {
      const encoded = encodeLeb128(val);
      const decoded = decodeLeb128(encoded);
      assert.equal(decoded.ok, true, `Failed decoding for ${val}`);
      if (decoded.ok) {
        assert.equal(decoded.value, val);
        assert.equal(decoded.bytesRead, encoded.length);
      }
    }
  });

  it('encodes 424248 as byte-exact b8f219 (C-LH-08)', () => {
    const encoded = encodeLeb128(424248);
    assert.equal(encodeHex(encoded), 'b8f219');
  });

  it('rejects non-canonical trailing zero bytes', () => {
    // 0 encoded non-canonically as 0x80 0x00
    const nonCanonicalZero = new Uint8Array([0x80, 0x00]);
    const res = decodeLeb128(nonCanonicalZero);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.match(res.reason, /Non-canonical/);
    }
  });

  it('rejects truncated LEB128 data', () => {
    // Continuation bit set without next byte
    const truncated = new Uint8Array([0x80]);
    const res = decodeLeb128(truncated);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.match(res.reason, /Truncated/);
    }
  });
});

describe('lighthouse assertion codecs', () => {
  const targetBuffer = 'J7KoxDEA5v3z7ARXhBUtWj4ZqRQ7LjDNy9J8PGf29XwB';
  const targetProgramData = 'CwvqZPbNrPEizu66jGhLEmB77mNqJvfYGs3ziCrqrVGi';
  const sampleKeccak = '7493f7a2076e37b976b7034dfd682dd4ad2952d38135c51a0b695f603353c9e0';

  it('encodes byte-exact instructions matching C-LH-08 golden vectors', () => {
    // 1. Owner assert
    const ownerAssert: LighthouseAssertion = {
      kind: 'buffer-owner',
      target: targetBuffer,
      owner: LOADER_V3_PROGRAM_ID,
    };
    const ownerIx = encodeLighthouseAssertion(ownerAssert);
    assert.equal(ownerIx.programId, LIGHTHOUSE_PROGRAM_ID);
    assert.equal(ownerIx.accounts.length, 1);
    assert.equal(ownerIx.accounts[0]?.address, targetBuffer);
    assert.equal(encodeHex(ownerIx.data.subarray(0, 3)), '050102');
    assert.equal(ownerIx.data[35], 0x00);

    // 2. DataLength assert (424285 = 37 + 424248 = 0x0006795d)
    const lengthAssert: LighthouseAssertion = {
      kind: 'buffer-length',
      target: targetBuffer,
      length: 424285n,
    };
    const lengthIx = encodeLighthouseAssertion(lengthAssert);
    assert.equal(encodeHex(lengthIx.data.subarray(0, 3)), '050101');
    assert.equal(encodeHex(lengthIx.data.subarray(3, 11)), '5d79060000000000');
    assert.equal(lengthIx.data[11], 0x00);

    // 3. VerifyDatahash assert (start 37, length 424248)
    const hashAssert: LighthouseAssertion = {
      kind: 'buffer-hash',
      target: targetBuffer,
      keccak256: sampleKeccak,
      start: 37n,
      length: 424248n,
    };
    const hashIx = encodeLighthouseAssertion(hashAssert);
    assert.equal(encodeHex(hashIx.data.subarray(0, 3)), '050108');
    assert.equal(encodeHex(hashIx.data.subarray(3, 35)), sampleKeccak);
    assert.equal(encodeHex(hashIx.data.subarray(35, 36)), '25'); // 37 in hex
    assert.equal(encodeHex(hashIx.data.subarray(36)), 'b8f219'); // 424248 in LEB128

    // 4. ProgramData slot assert (slot 0)
    const slotAssert: LighthouseAssertion = {
      kind: 'program-data-slot',
      target: targetProgramData,
      slot: 0n,
    };
    const slotIx = encodeLighthouseAssertion(slotAssert);
    assert.equal(encodeHex(slotIx.data.subarray(0, 4)), '0d010301');
    assert.equal(encodeHex(slotIx.data.subarray(4, 12)), '0000000000000000');
    assert.equal(slotIx.data[12], 0x00);
  });

  it('round-trips all four assertions', () => {
    const assertions: LighthouseAssertion[] = [
      { kind: 'buffer-owner', target: targetBuffer, owner: LOADER_V3_PROGRAM_ID },
      { kind: 'buffer-length', target: targetBuffer, length: 424285n },
      { kind: 'buffer-hash', target: targetBuffer, keccak256: sampleKeccak, start: 37n, length: 424248n },
      { kind: 'program-data-slot', target: targetProgramData, slot: 123456789n },
    ];

    for (const a of assertions) {
      const ix = encodeLighthouseAssertion(a);
      const decoded = decodeLighthouseAssertion(ix);
      assert.equal(decoded.ok, true);
      if (decoded.ok) {
        assert.deepEqual(decoded.assertion, a);
      }
    }
  });

  it('returns typed failure on trailing bytes in VerifyDatahash', () => {
    const hashAssert: LighthouseAssertion = {
      kind: 'buffer-hash',
      target: targetBuffer,
      keccak256: sampleKeccak,
      start: 37n,
      length: 424248n,
    };
    const ix = encodeLighthouseAssertion(hashAssert);
    // Append trailing byte
    const extendedData = new Uint8Array(ix.data.length + 1);
    extendedData.set(ix.data);
    extendedData[ix.data.length] = 0xff;

    const res = decodeLighthouseAssertion({ ...ix, data: extendedData });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.match(res.reason, /trailing bytes/);
    }
  });

  it('returns typed failure on unsupported operators or invalid log levels', () => {
    const lengthAssert: LighthouseAssertion = {
      kind: 'buffer-length',
      target: targetBuffer,
      length: 100n,
    };
    const ix = encodeLighthouseAssertion(lengthAssert);

    // Corrupt log level (index 1) to 0x00 (Silent)
    const badLog = new Uint8Array(ix.data);
    badLog[1] = 0x00;
    assert.equal(decodeLighthouseAssertion({ ...ix, data: badLog }).ok, false);

    // Corrupt operator (index 11) to 0x01 (NotEqual)
    const badOp = new Uint8Array(ix.data);
    badOp[11] = 0x01;
    assert.equal(decodeLighthouseAssertion({ ...ix, data: badOp }).ok, false);
  });
});
