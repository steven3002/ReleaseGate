import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseManifest } from '../../src/manifest/parse';
import { bindArtifactToManifest } from '../../src/manifest/binding';
import { sha256 } from '../../src/digest/sha256';

const VALID_MANIFEST_OBJECT = {
  schema: 'releasegate.manifest/1',
  release: { name: 'release-demo', version: '2' },
  cluster: { name: 'devnet', genesisHash: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG' },
  multisig: '3f898hTpu3vrjXsCo3EWGC4STjFi6CVk7g9EvKRP1VTz',
  vaultIndex: 0,
  vault: 'G8jZGsyWv1dGJP89ujJteoDpQCuh5yAN3pn6DqiJGbcB',
  program: 'CxKhVB8eyBawrEmaqBkRmcVN47RJya1SSpxYiygR9tpJ',
  expectedDeploymentSlot: 100,
  artifact: {
    fileName: 'release_demo.so',
    length: 12345,
    sha256: 'a'.repeat(64),
    keccak256: 'b'.repeat(64),
    verifiedBuildSha256: 'c'.repeat(64),
  },
  provenance: {
    sourceRepository: 'https://github.com/example/repo',
    commit: 'd'.repeat(40),
    buildMethod: 'cargo build-sbf',
    builder: 'Alice',
    builtAt: '2026-10-10T12:00:00Z',
  },
  buffer: 'J7KoxDEA5v3z7ARXhBUtWj4ZqRQ7LjDNy9J8PGf29XwB',
  signature: null,
};

describe('parseManifest', () => {
  it('parses a valid manifest and records manifestSha256', () => {
    const rawBytes = new TextEncoder().encode(JSON.stringify(VALID_MANIFEST_OBJECT));
    const res = parseManifest(rawBytes);
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.manifestSha256, sha256(rawBytes));
      assert.equal(res.manifest.schema, 'releasegate.manifest/1');
      assert.equal(res.manifest.vaultIndex, 0);
      assert.equal(res.manifest.expectedDeploymentSlot, 100n);
      assert.equal(res.manifest.artifact.length, 12345);
      assert.equal(res.manifest.provenance.builder, 'Alice');
    }
  });

  it('rejects unknown top-level field', () => {
    const bad = { ...VALID_MANIFEST_OBJECT, extraUnknownField: 'forbidden' };
    const res = parseManifest(new TextEncoder().encode(JSON.stringify(bad)));
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.match(res.reason, /Unknown top-level field/);
      assert.equal(res.field, 'extraUnknownField');
    }
  });

  it('rejects invalid schema version', () => {
    const bad = { ...VALID_MANIFEST_OBJECT, schema: 'releasegate.manifest/2' };
    const res = parseManifest(new TextEncoder().encode(JSON.stringify(bad)));
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.field, 'schema');
    }
  });

  it('rejects malformed address or hash', () => {
    const badAddr = { ...VALID_MANIFEST_OBJECT, program: 'not-a-valid-address' };
    assert.equal(parseManifest(new TextEncoder().encode(JSON.stringify(badAddr))).ok, false);

    const badHash = {
      ...VALID_MANIFEST_OBJECT,
      artifact: { ...VALID_MANIFEST_OBJECT.artifact, sha256: 'short' },
    };
    assert.equal(parseManifest(new TextEncoder().encode(JSON.stringify(badHash))).ok, false);

    const badCommit = {
      ...VALID_MANIFEST_OBJECT,
      provenance: { ...VALID_MANIFEST_OBJECT.provenance, commit: 'not-40-hex' },
    };
    assert.equal(parseManifest(new TextEncoder().encode(JSON.stringify(badCommit))).ok, false);
  });

  it('rejects invalid date string', () => {
    const badDate = {
      ...VALID_MANIFEST_OBJECT,
      provenance: { ...VALID_MANIFEST_OBJECT.provenance, builtAt: 'not-a-date' },
    };
    const res = parseManifest(new TextEncoder().encode(JSON.stringify(badDate)));
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.field, 'provenance.builtAt');
    }
  });
});

describe('bindArtifactToManifest', () => {
  const bytes = new TextEncoder().encode(JSON.stringify(VALID_MANIFEST_OBJECT));
  const parsed = parseManifest(bytes);
  assert.equal(parsed.ok, true);
  const manifest = (parsed as { ok: true; manifest: any }).manifest;

  it('succeeds when all artifact digests match', () => {
    const mockDigests = {
      length: 12345,
      sha256: 'a'.repeat(64),
      keccak256: 'b'.repeat(64),
      verifiedBuildSha256: 'c'.repeat(64),
    };
    const binding = bindArtifactToManifest(mockDigests, manifest);
    assert.equal(binding.matches, true);
    assert.equal(binding.errors.length, 0);
  });

  it('detects length mismatch', () => {
    const mockDigests = {
      length: 12346,
      sha256: 'a'.repeat(64),
      keccak256: 'b'.repeat(64),
      verifiedBuildSha256: 'c'.repeat(64),
    };
    const binding = bindArtifactToManifest(mockDigests, manifest);
    assert.equal(binding.matches, false);
    assert.match(binding.errors[0] ?? '', /length mismatch/);
  });

  it('detects sha256 mismatch', () => {
    const mockDigests = {
      length: 12345,
      sha256: 'f'.repeat(64),
      keccak256: 'b'.repeat(64),
      verifiedBuildSha256: 'c'.repeat(64),
    };
    const binding = bindArtifactToManifest(mockDigests, manifest);
    assert.equal(binding.matches, false);
    assert.match(binding.errors[0] ?? '', /SHA-256 mismatch/);
  });

  it('detects keccak256 mismatch', () => {
    const mockDigests = {
      length: 12345,
      sha256: 'a'.repeat(64),
      keccak256: 'f'.repeat(64),
      verifiedBuildSha256: 'c'.repeat(64),
    };
    const binding = bindArtifactToManifest(mockDigests, manifest);
    assert.equal(binding.matches, false);
    assert.match(binding.errors[0] ?? '', /Keccak-256 mismatch/);
  });
});
