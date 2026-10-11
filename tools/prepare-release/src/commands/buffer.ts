import * as fs from 'node:fs/promises';
import { Connection, Keypair } from '@solana/web3.js';
import {
  compareBytes,
  computeArtifactDigests,
  decodeBufferAccount,
  deriveVaultPda,
  LOADER_V3_PROGRAM_ID,
  Web3ChainReader,
} from 'release-core';
import { assertDevnetCluster } from '../signing/cluster-guard';
import { loadKeypairFile } from '../signing/keypair-file';
import { cliSetBufferAuthority, cliWriteBuffer } from '../solana-cli/program-commands';
import type { EvidenceRecord } from '../records/record';
import { writeEvidenceRecord } from '../records/record';
import { getFlag, parseArgs } from './args';

export async function handleBuffer(args: readonly string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const artifactPath = getFlag(flags, 'artifact');
  const bufferKeypairPath = getFlag(flags, 'buffer-keypair');
  const bufferKeypairOut = getFlag(flags, 'buffer-keypair-out');
  const multisig = getFlag(flags, 'multisig');
  const vaultIndexStr = getFlag(flags, 'vault-index') ?? '0';
  const payerPath = getFlag(flags, 'payer');
  const recordPath = getFlag(flags, 'record');
  const rpcUrl = getFlag(flags, 'url') ?? 'https://api.devnet.solana.com';

  if (!artifactPath || !multisig || !payerPath) {
    process.stderr.write(
      'Usage: prepare-release buffer --artifact <path> --multisig <pubkey> --payer <keypair-path> [--buffer-keypair <path>] [--buffer-keypair-out <path>] [--vault-index 0] [--record <path>]\n',
    );
    return 2;
  }

  const connection = new Connection(rpcUrl, 'confirmed');
  const genesisHash = await assertDevnetCluster(connection);
  const chainReader = new Web3ChainReader(connection);

  const artifactBytes = await fs.readFile(artifactPath);
  const digests = computeArtifactDigests(new Uint8Array(artifactBytes));

  const vaultIndex = parseInt(vaultIndexStr, 10);
  const vault = deriveVaultPda(multisig, vaultIndex).address;

  let bufferKeypair: Keypair;
  let activeBufferKeypairPath: string;
  if (bufferKeypairPath) {
    bufferKeypair = await loadKeypairFile(bufferKeypairPath);
    activeBufferKeypairPath = bufferKeypairPath;
  } else {
    bufferKeypair = Keypair.generate();
    activeBufferKeypairPath = bufferKeypairOut ?? `/tmp/rg-buffer-${Date.now()}.json`;
    await fs.writeFile(activeBufferKeypairPath, JSON.stringify(Array.from(bufferKeypair.secretKey)), {
      mode: 0o600,
    });
  }

  const bufferPubkey = bufferKeypair.publicKey.toBase58();

  process.stdout.write(`Writing buffer account ${bufferPubkey}...\n`);
  try {
    const writeRes = await cliWriteBuffer({
      programFilepath: artifactPath,
      bufferKeypair: activeBufferKeypairPath,
      url: rpcUrl,
      keypair: payerPath,
    });
    process.stdout.write(writeRes.stdout);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Failed to write buffer: ${msg}\n`);
    return 1;
  }

  process.stdout.write(`Transferring buffer authority to vault PDA ${vault}...\n`);
  try {
    const authRes = await cliSetBufferAuthority({
      bufferPubkey,
      newAuthority: vault,
      url: rpcUrl,
      keypair: payerPath,
    });
    process.stdout.write(authRes.stdout);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Failed to set buffer authority: ${msg}\n`);
    return 1;
  }

  // Verify buffer with release-core
  const { accounts } = await chainReader.getAccounts([bufferPubkey]);
  const bufferAccount = accounts[0];
  if (!bufferAccount) {
    process.stderr.write('Verification failed: buffer account not found on chain\n');
    return 1;
  }

  if (bufferAccount.owner !== LOADER_V3_PROGRAM_ID) {
    process.stderr.write(
      `Verification failed: expected buffer owner ${LOADER_V3_PROGRAM_ID}, found ${bufferAccount.owner}\n`,
    );
    return 1;
  }

  const decoded = decodeBufferAccount(bufferAccount.data);
  if (!decoded.ok) {
    process.stderr.write(`Verification failed: buffer decode error: ${decoded.reason}\n`);
    return 1;
  }

  if (decoded.value.authority !== vault) {
    process.stderr.write(
      `Verification failed: expected buffer authority ${vault}, found ${decoded.value.authority ?? 'None'}\n`,
    );
    return 1;
  }

  const payload = bufferAccount.data.subarray(37);
  if (payload.length !== digests.length) {
    process.stderr.write(
      `Verification failed: payload length ${payload.length} does not match artifact length ${digests.length}\n`,
    );
    return 1;
  }

  if (!compareBytes(payload, new Uint8Array(artifactBytes))) {
    process.stderr.write('Verification failed: buffer payload does not match artifact bytes\n');
    return 1;
  }

  process.stdout.write(`Buffer created, transferred to vault, and verified on chain!\n`);
  process.stdout.write(`  Buffer:    ${bufferPubkey}\n`);
  process.stdout.write(`  Authority: ${vault}\n`);
  process.stdout.write(`  Payload:   ${payload.length} bytes\n`);
  process.stdout.write(`  SHA-256:   ${digests.sha256}\n`);

  if (recordPath) {
    const record: EvidenceRecord = {
      command: 'buffer',
      timestamp: new Date().toISOString(),
      cluster: 'devnet',
      genesisHash,
      inputs: {
        artifactPath,
        multisig,
        vaultIndex,
        payloadLength: digests.length,
      },
      addresses: {
        buffer: bufferPubkey,
        authority: vault,
        loader: LOADER_V3_PROGRAM_ID,
      },
      signatures: [],
      slots: {},
      outcome: 'success',
      result: {
        buffer: bufferPubkey,
        authority: vault,
        length: digests.length,
        sha256: digests.sha256,
        keccak256: digests.keccak256,
      },
    };
    await writeEvidenceRecord(recordPath, record);
  }

  return 0;
}
