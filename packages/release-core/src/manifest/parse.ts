import { PublicKey } from '@solana/web3.js';
import { sha256 } from '../digest/sha256';
import { MANIFEST_SCHEMA_V1 } from './schema';
import type { ReleaseManifest } from './schema';

declare const TextDecoder: {
  new (label?: string, options?: { fatal?: boolean }): {
    decode(input?: Uint8Array): string;
  };
};

export interface ManifestParseSuccess {
  readonly ok: true;
  readonly manifest: ReleaseManifest;
  readonly manifestSha256: string;
}

export interface ManifestParseFailure {
  readonly ok: false;
  readonly reason: string;
  readonly field?: string | undefined;
}

export type ManifestParseResult = ManifestParseSuccess | ManifestParseFailure;

const KNOWN_TOP_LEVEL_FIELDS = new Set([
  'schema',
  'release',
  'cluster',
  'multisig',
  'vaultIndex',
  'vault',
  'program',
  'expectedDeploymentSlot',
  'artifact',
  'provenance',
  'buffer',
  'signature',
]);

const HEX_64_REGEX = /^[0-9a-f]{64}$/i;
const HEX_40_REGEX = /^[0-9a-f]{40}$/i;

function isValidPubkey(val: unknown): val is string {
  if (typeof val !== 'string' || val.length < 32 || val.length > 44) {
    return false;
  }
  try {
    new PublicKey(val);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parses and validates release manifest JSON bytes.
 * Manifest identity is the literal SHA-256 over the exact input bytes.
 * Rejects unknown top-level fields, missing required fields, or malformed cryptographic types.
 */
export function parseManifest(bytes: Uint8Array): ManifestParseResult {
  const manifestSha256 = sha256(bytes);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (err) {
    return { ok: false, reason: `Failed to decode UTF-8 manifest text: ${String(err)}` };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { ok: false, reason: `Invalid JSON syntax: ${String(err)}` };
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: 'Manifest root must be an object' };
  }

  const obj = raw as Record<string, unknown>;

  // Check unknown top-level fields
  for (const key of Object.keys(obj)) {
    if (!KNOWN_TOP_LEVEL_FIELDS.has(key)) {
      return { ok: false, reason: `Unknown top-level field: "${key}"`, field: key };
    }
  }

  // schema
  if (obj['schema'] !== MANIFEST_SCHEMA_V1) {
    return {
      ok: false,
      reason: `Expected schema "${MANIFEST_SCHEMA_V1}", got "${String(obj['schema'])}"`,
      field: 'schema',
    };
  }

  // cluster
  const cluster = obj['cluster'];
  if (typeof cluster !== 'object' || cluster === null || Array.isArray(cluster)) {
    return { ok: false, reason: 'Missing or invalid "cluster" object', field: 'cluster' };
  }
  const clusterObj = cluster as Record<string, unknown>;
  if (typeof clusterObj['name'] !== 'string' || clusterObj['name'].trim() === '') {
    return { ok: false, reason: 'Invalid or missing "cluster.name"', field: 'cluster.name' };
  }
  if (!isValidPubkey(clusterObj['genesisHash'])) {
    return { ok: false, reason: 'Invalid or missing "cluster.genesisHash"', field: 'cluster.genesisHash' };
  }

  // multisig
  if (!isValidPubkey(obj['multisig'])) {
    return { ok: false, reason: 'Invalid or missing "multisig" address', field: 'multisig' };
  }

  // vaultIndex
  const vaultIndex = obj['vaultIndex'];
  if (typeof vaultIndex !== 'number' || !Number.isInteger(vaultIndex) || vaultIndex < 0) {
    return { ok: false, reason: 'Missing or invalid "vaultIndex" (must be non-negative integer)', field: 'vaultIndex' };
  }

  // vault
  if (!isValidPubkey(obj['vault'])) {
    return { ok: false, reason: 'Invalid or missing "vault" address', field: 'vault' };
  }

  // program
  if (!isValidPubkey(obj['program'])) {
    return { ok: false, reason: 'Invalid or missing "program" address', field: 'program' };
  }

  // expectedDeploymentSlot
  const slotRaw = obj['expectedDeploymentSlot'];
  let expectedDeploymentSlot: bigint;
  if (typeof slotRaw === 'number' && Number.isInteger(slotRaw) && slotRaw >= 0) {
    expectedDeploymentSlot = BigInt(slotRaw);
  } else if (typeof slotRaw === 'string' && /^\d+$/.test(slotRaw)) {
    expectedDeploymentSlot = BigInt(slotRaw);
  } else {
    return {
      ok: false,
      reason: 'Missing or invalid "expectedDeploymentSlot" (must be non-negative integer)',
      field: 'expectedDeploymentSlot',
    };
  }

  // artifact
  const artifact = obj['artifact'];
  if (typeof artifact !== 'object' || artifact === null || Array.isArray(artifact)) {
    return { ok: false, reason: 'Missing or invalid "artifact" object', field: 'artifact' };
  }
  const artObj = artifact as Record<string, unknown>;
  const artLen = artObj['length'];
  if (typeof artLen !== 'number' || !Number.isInteger(artLen) || artLen <= 0) {
    return { ok: false, reason: 'Invalid or missing "artifact.length" (must be positive integer)', field: 'artifact.length' };
  }
  const sha256Val = artObj['sha256'];
  if (typeof sha256Val !== 'string' || !HEX_64_REGEX.test(sha256Val)) {
    return { ok: false, reason: 'Invalid or missing "artifact.sha256" (must be 64-hex digits)', field: 'artifact.sha256' };
  }
  const keccak256Val = artObj['keccak256'];
  if (typeof keccak256Val !== 'string' || !HEX_64_REGEX.test(keccak256Val)) {
    return { ok: false, reason: 'Invalid or missing "artifact.keccak256" (must be 64-hex digits)', field: 'artifact.keccak256' };
  }
  const verifiedBuildSha256Val = artObj['verifiedBuildSha256'];
  if (verifiedBuildSha256Val !== undefined && (typeof verifiedBuildSha256Val !== 'string' || !HEX_64_REGEX.test(verifiedBuildSha256Val))) {
    return { ok: false, reason: 'Invalid "artifact.verifiedBuildSha256" (must be 64-hex digits)', field: 'artifact.verifiedBuildSha256' };
  }

  // provenance
  const provenance = obj['provenance'];
  if (typeof provenance !== 'object' || provenance === null || Array.isArray(provenance)) {
    return { ok: false, reason: 'Missing or invalid "provenance" object', field: 'provenance' };
  }
  const provObj = provenance as Record<string, unknown>;
  if (typeof provObj['sourceRepository'] !== 'string' || provObj['sourceRepository'].trim() === '') {
    return { ok: false, reason: 'Invalid or missing "provenance.sourceRepository"', field: 'provenance.sourceRepository' };
  }
  const commitVal = provObj['commit'];
  if (typeof commitVal !== 'string' || !HEX_40_REGEX.test(commitVal)) {
    return { ok: false, reason: 'Invalid or missing "provenance.commit" (must be 40-hex git commit hash)', field: 'provenance.commit' };
  }
  if (typeof provObj['buildMethod'] !== 'string' || provObj['buildMethod'].trim() === '') {
    return { ok: false, reason: 'Invalid or missing "provenance.buildMethod"', field: 'provenance.buildMethod' };
  }
  if (typeof provObj['builder'] !== 'string' || provObj['builder'].trim() === '') {
    return { ok: false, reason: 'Invalid or missing "provenance.builder"', field: 'provenance.builder' };
  }
  const builtAtVal = provObj['builtAt'];
  if (typeof builtAtVal !== 'string' || isNaN(Date.parse(builtAtVal))) {
    return { ok: false, reason: 'Invalid or missing "provenance.builtAt" (must be valid ISO 8601 date string)', field: 'provenance.builtAt' };
  }

  // optional buffer
  if (obj['buffer'] !== undefined && !isValidPubkey(obj['buffer'])) {
    return { ok: false, reason: 'Invalid "buffer" address hint', field: 'buffer' };
  }

  // optional release
  let releaseInfo = undefined;
  if (obj['release'] !== undefined) {
    if (typeof obj['release'] !== 'object' || obj['release'] === null || Array.isArray(obj['release'])) {
      return { ok: false, reason: 'Invalid "release" field', field: 'release' };
    }
    const relObj = obj['release'] as Record<string, unknown>;
    if (typeof relObj['name'] !== 'string' || typeof relObj['version'] !== 'string') {
      return { ok: false, reason: 'Invalid "release.name" or "release.version"', field: 'release' };
    }
    releaseInfo = { name: relObj['name'], version: relObj['version'] };
  }

  const manifest: ReleaseManifest = {
    schema: MANIFEST_SCHEMA_V1,
    release: releaseInfo,
    cluster: {
      name: String(clusterObj['name']),
      genesisHash: String(clusterObj['genesisHash']),
    },
    multisig: String(obj['multisig']),
    vaultIndex,
    vault: String(obj['vault']),
    program: String(obj['program']),
    expectedDeploymentSlot,
    artifact: {
      fileName: typeof artObj['fileName'] === 'string' ? artObj['fileName'] : undefined,
      length: artLen,
      sha256: sha256Val.toLowerCase(),
      keccak256: keccak256Val.toLowerCase(),
      verifiedBuildSha256: typeof verifiedBuildSha256Val === 'string' ? verifiedBuildSha256Val.toLowerCase() : undefined,
    },
    provenance: {
      sourceRepository: String(provObj['sourceRepository']),
      commit: commitVal.toLowerCase(),
      buildMethod: String(provObj['buildMethod']),
      builder: String(provObj['builder']),
      builtAt: builtAtVal,
    },
    buffer: typeof obj['buffer'] === 'string' ? obj['buffer'] : undefined,
    signature: obj['signature'],
  };

  return {
    ok: true,
    manifest,
    manifestSha256,
  };
}
