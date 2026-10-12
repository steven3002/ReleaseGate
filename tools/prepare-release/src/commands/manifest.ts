import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Connection } from '@solana/web3.js';
import {
  CLUSTERS,
  computeArtifactDigests,
  decodeProgramDataAccount,
  deriveProgramDataAddress,
  deriveVaultPda,
  parseManifest,
  Web3ChainReader,
} from 'release-core';
import { assertDevnetCluster } from '../signing/cluster-guard';
import type { EvidenceRecord } from '../records/record';
import { writeEvidenceRecord } from '../records/record';
import { getFlag, parseArgs } from './args';

export async function handleManifest(args: readonly string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const artifactPath = getFlag(flags, 'artifact');
  const program = getFlag(flags, 'program');
  const multisig = getFlag(flags, 'multisig');
  const vaultIndexStr = getFlag(flags, 'vault-index') ?? '0';
  const sourceRepo = getFlag(flags, 'source-repo') ?? 'https://github.com/example/release-demo';
  const commit = getFlag(flags, 'commit') ?? '0000000000000000000000000000000000000000';
  const buildMethod = getFlag(flags, 'build-method') ?? 'cargo-build-sbf';
  const builder = getFlag(flags, 'builder') ?? 'release-preparer';
  const releaseName = getFlag(flags, 'release-name') ?? 'release-demo';
  const releaseVersion = getFlag(flags, 'release-version') ?? '2';
  const outPath = getFlag(flags, 'out');
  const recordPath = getFlag(flags, 'record');
  const rpcUrl = getFlag(flags, 'url') ?? 'https://api.devnet.solana.com';

  if (!artifactPath || !program || !multisig) {
    process.stderr.write('Usage: prepare-release manifest --artifact <path> --program <pubkey> --multisig <pubkey> [--vault-index 0] [--out <path>] [--record <path>]\n');
    return 2;
  }

  const connection = new Connection(rpcUrl, 'confirmed');
  const genesisHash = await assertDevnetCluster(connection);
  const chainReader = new Web3ChainReader(connection);

  const artifactBytes = await fs.readFile(artifactPath);
  const digests = computeArtifactDigests(new Uint8Array(artifactBytes));

  const programDataAddress = deriveProgramDataAddress(program);
  const { accounts } = await chainReader.getAccounts([programDataAddress]);
  const programDataAcc = accounts[0];

  const slotFlag = getFlag(flags, 'slot');
  let expectedDeploymentSlot = 0;
  if (slotFlag !== undefined) {
    expectedDeploymentSlot = parseInt(slotFlag, 10);
  } else if (programDataAcc) {
    const decoded = decodeProgramDataAccount(programDataAcc.data);
    if (decoded.ok) {
      expectedDeploymentSlot = Number(decoded.value.slot);
    }
  }

  const vaultIndex = parseInt(vaultIndexStr, 10);
  const vault = deriveVaultPda(multisig, vaultIndex).address;

  const fileName = path.basename(artifactPath);

  const manifest = {
    schema: 'releasegate.manifest/1' as const,
    release: {
      name: releaseName,
      version: releaseVersion,
    },
    cluster: {
      name: 'devnet',
      genesisHash: CLUSTERS.devnet.genesisHash,
    },
    multisig,
    vaultIndex,
    vault,
    program,
    expectedDeploymentSlot,
    artifact: {
      fileName,
      length: digests.length,
      sha256: digests.sha256,
      keccak256: digests.keccak256,
      verifiedBuildSha256: digests.verifiedBuildSha256,
    },
    provenance: {
      sourceRepository: sourceRepo,
      commit,
      buildMethod,
      builder,
      builtAt: new Date().toISOString(),
    },
  };

  const manifestJson = JSON.stringify(manifest, null, 2);
  const validationResult = parseManifest(new TextEncoder().encode(manifestJson));
  if (!validationResult.ok) {
    process.stderr.write(`Manifest validation failed: ${validationResult.reason} (${validationResult.field ?? 'unknown'})\n`);
    return 1;
  }

  if (outPath) {
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, `${manifestJson}\n`, 'utf8');
    process.stdout.write(`Wrote manifest to ${outPath} (manifestSha256: ${validationResult.manifestSha256})\n`);
  } else {
    process.stdout.write(`${manifestJson}\n`);
  }

  if (recordPath) {
    const record: EvidenceRecord = {
      command: 'manifest',
      timestamp: new Date().toISOString(),
      cluster: 'devnet',
      genesisHash,
      inputs: {
        artifactPath,
        program,
        multisig,
        vaultIndex,
      },
      addresses: {
        program,
        programData: programDataAddress,
        vault,
        multisig,
      },
      signatures: [],
      slots: {
        expectedDeploymentSlot,
      },
      outcome: 'success',
      result: {
        manifestSha256: validationResult.manifestSha256,
        artifactLength: digests.length,
        artifactSha256: digests.sha256,
        artifactKeccak256: digests.keccak256,
      },
    };
    await writeEvidenceRecord(recordPath, record);
  }

  return 0;
}
