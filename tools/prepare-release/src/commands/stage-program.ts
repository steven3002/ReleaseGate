import { Connection } from '@solana/web3.js';
import {
  decodeProgramAccount,
  decodeProgramDataAccount,
  deriveProgramDataAddress,
  deriveVaultPda,
  LOADER_V3_PROGRAM_ID,
  Web3ChainReader,
} from 'release-core';
import { assertDevnetCluster } from '../signing/cluster-guard';
import { loadKeypairFile } from '../signing/keypair-file';
import { cliDeployProgram, cliSetUpgradeAuthority } from '../solana-cli/program-commands';
import type { EvidenceRecord } from '../records/record';
import { writeEvidenceRecord } from '../records/record';
import { getFlag, parseArgs } from './args';

export async function handleStageProgram(args: readonly string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const binaryPath = getFlag(flags, 'program-binary');
  const programKeypairPath = getFlag(flags, 'program-keypair');
  const multisig = getFlag(flags, 'multisig');
  const vaultIndexStr = getFlag(flags, 'vault-index') ?? '0';
  const maxLenStr = getFlag(flags, 'max-len') ?? '4000';
  const payerPath = getFlag(flags, 'payer');
  const recordPath = getFlag(flags, 'record');
  const rpcUrl = getFlag(flags, 'url') ?? 'https://api.devnet.solana.com';

  if (!binaryPath || !programKeypairPath || !multisig || !payerPath) {
    process.stderr.write(
      'Usage: prepare-release stage-program --program-binary <path> --program-keypair <path> --multisig <pubkey> --payer <keypair-path> [--max-len 4000] [--vault-index 0] [--record <path>]\n',
    );
    return 2;
  }

  const connection = new Connection(rpcUrl, 'confirmed');
  const genesisHash = await assertDevnetCluster(connection);
  const chainReader = new Web3ChainReader(connection);

  const programKeypair = await loadKeypairFile(programKeypairPath);
  const programId = programKeypair.publicKey.toBase58();
  const vaultIndex = parseInt(vaultIndexStr, 10);
  const vault = deriveVaultPda(multisig, vaultIndex).address;
  const maxLen = parseInt(maxLenStr, 10);

  process.stdout.write(`Deploying program ${programId} with max-len ${maxLen}...\n`);
  try {
    const deployRes = await cliDeployProgram({
      programFilepath: binaryPath,
      programKeypair: programKeypairPath,
      url: rpcUrl,
      keypair: payerPath,
      maxLen,
    });
    process.stdout.write(deployRes.stdout);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Failed to deploy program: ${msg}\n`);
    return 1;
  }

  process.stdout.write(`Transferring upgrade authority to vault PDA ${vault}...\n`);
  try {
    const authRes = await cliSetUpgradeAuthority({
      programAddress: programId,
      newAuthority: vault,
      url: rpcUrl,
      keypair: payerPath,
    });
    process.stdout.write(authRes.stdout);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Failed to set upgrade authority: ${msg}\n`);
    return 1;
  }

  // Verify on-chain state with release-core
  const programDataAddress = deriveProgramDataAddress(programId);
  const { accounts } = await chainReader.getAccounts([programId, programDataAddress]);
  const programAccount = accounts[0];
  const programDataAccount = accounts[1];

  if (!programAccount || !programDataAccount) {
    process.stderr.write('Verification failed: program or programData account not found on chain\n');
    return 1;
  }

  const decodedProgram = decodeProgramAccount(programAccount.data);
  if (!decodedProgram.ok) {
    process.stderr.write(`Verification failed: program account decoding failed: ${decodedProgram.reason}\n`);
    return 1;
  }

  const decodedData = decodeProgramDataAccount(programDataAccount.data);
  if (!decodedData.ok) {
    process.stderr.write(`Verification failed: programData account decoding failed: ${decodedData.reason}\n`);
    return 1;
  }

  if (decodedData.value.upgradeAuthority !== vault) {
    process.stderr.write(
      `Verification failed: expected upgrade authority ${vault}, found ${decodedData.value.upgradeAuthority ?? 'None'}\n`,
    );
    return 1;
  }

  const deploymentSlot = Number(decodedData.value.slot);
  process.stdout.write(`Program staged and verified on chain!\n`);
  process.stdout.write(`  Program ID:        ${programId}\n`);
  process.stdout.write(`  Program Data:      ${programDataAddress}\n`);
  process.stdout.write(`  Upgrade Authority: ${vault}\n`);
  process.stdout.write(`  Deployment Slot:   ${deploymentSlot}\n`);

  if (recordPath) {
    const record: EvidenceRecord = {
      command: 'stage-program',
      timestamp: new Date().toISOString(),
      cluster: 'devnet',
      genesisHash,
      inputs: {
        binaryPath,
        programId,
        multisig,
        vaultIndex,
        maxLen,
      },
      addresses: {
        program: programId,
        programData: programDataAddress,
        vault,
        multisig,
        loader: LOADER_V3_PROGRAM_ID,
      },
      signatures: [],
      slots: {
        deploymentSlot,
      },
      outcome: 'success',
      result: {
        programId,
        programDataAddress,
        upgradeAuthority: vault,
        deploymentSlot,
      },
    };
    await writeEvidenceRecord(recordPath, record);
  }

  return 0;
}
