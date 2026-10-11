import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { keccak256 } from '../../src/digest/keccak256';
import { sha256 } from '../../src/digest/sha256';
import { stripTrailingZeros, verifiedBuildSha256 } from '../../src/digest/verified-build';
import { computeArtifactDigests } from '../../src/digest/artifact-digests';
import { decodeHex } from '../../src/digest/hex';

describe('sha256', () => {
  it('matches RFC 6234 known answer for "abc"', () => {
    const input = new TextEncoder().encode('abc');
    assert.equal(
      sha256(input),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('matches RFC 6234 known answer for 56-byte message', () => {
    const input = new TextEncoder().encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq');
    assert.equal(
      sha256(input),
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'
    );
  });
});

describe('keccak256', () => {
  it('matches ShortMsgKAT_256 for empty message and differs from NIST SHA3-256', () => {
    const empty = new Uint8Array(0);
    const result = keccak256(empty);
    assert.equal(result, 'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
    // NIST SHA3-256 of empty message is a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a
    assert.notEqual(result, 'a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a');
  });

  it('matches ShortMsgKAT_256 for 3-byte vector 0x1f877c', () => {
    const hex = decodeHex('1f877c');
    assert.equal(hex.ok, true);
    if (hex.ok) {
      assert.equal(
        keccak256(hex.bytes),
        '627d7bc1491b2ab127282827b8de2d276b13d7d70fb4c5957fdf20655bc7ac30'
      );
    }
  });

  it('matches ShortMsgKAT_256 for 4-byte vector 0xc1ecfdfc', () => {
    const hex = decodeHex('c1ecfdfc');
    assert.equal(hex.ok, true);
    if (hex.ok) {
      assert.equal(
        keccak256(hex.bytes),
        'b149e766d7612eaf7d55f74e1a4fdd63709a8115b14f61fcd22aa4abc8b8e122'
      );
    }
  });
});

describe('verified-build', () => {
  it('strips only trailing zero bytes', () => {
    assert.deepEqual(stripTrailingZeros(new Uint8Array([1, 2, 3, 0, 0])), new Uint8Array([1, 2, 3]));
    assert.deepEqual(stripTrailingZeros(new Uint8Array([0, 1, 0, 2, 0])), new Uint8Array([0, 1, 0, 2]));
    assert.deepEqual(stripTrailingZeros(new Uint8Array([0, 0, 0])), new Uint8Array(0));
    assert.deepEqual(stripTrailingZeros(new Uint8Array(0)), new Uint8Array(0));
    assert.deepEqual(stripTrailingZeros(new Uint8Array([1, 2, 3])), new Uint8Array([1, 2, 3]));
  });

  it('computes sha256 over trimmed payload', () => {
    const trimmed = new Uint8Array([1, 2, 3]);
    const padded = new Uint8Array([1, 2, 3, 0, 0, 0]);
    assert.equal(verifiedBuildSha256(padded), sha256(trimmed));
  });
});

describe('artifact digests', () => {
  it('computes length and all three conventions', () => {
    const payload = new Uint8Array([10, 20, 30, 0]);
    const digests = computeArtifactDigests(payload);
    assert.equal(digests.length, 4);
    assert.equal(digests.sha256, sha256(payload));
    assert.equal(digests.keccak256, keccak256(payload));
    assert.equal(digests.verifiedBuildSha256, sha256(new Uint8Array([10, 20, 30])));
  });

  it('matches C-HASH-02 three-convention vector when Lighthouse ELF is present', (t) => {
    const candidates = [
      path.resolve(__dirname, '../../../../evidence/local-validation/lighthouse-onchain.so'),
    ];
    const elfPath = candidates.find(c => existsSync(c));
    if (!elfPath) {
      t.skip('Lighthouse ELF not present on disk; skipped C-HASH-02 vector assertion');
      return;
    }
    const bytes = new Uint8Array(readFileSync(elfPath));
    const digests = computeArtifactDigests(bytes);
    assert.equal(digests.length, 424248);
    assert.equal(digests.keccak256, '7493f7a2076e37b976b7034dfd682dd4ad2952d38135c51a0b695f603353c9e0');
    assert.equal(digests.sha256, 'a89179ae024ac36aa5fc308251caa84cd0a3390ae66d8523514004a86d5148bb');
    assert.equal(digests.verifiedBuildSha256, 'b70084e0d1de4a551c2bf9740a9b5012600edb98b56fd84065f0e8f47762529a');
  });
});
