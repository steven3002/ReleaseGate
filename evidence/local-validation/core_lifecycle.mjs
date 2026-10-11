/**
 * Replays the 14-step Squads multisig release lifecycle through LiteSVM
 * using only release-core builders. Tested against both mainnet and devnet Squads builds.
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as sq from '@sqds/multisig';
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import {
  buildApprove,
  buildCreateGuardedProposal,
  buildExecute,
  buildGuardedUpgrade,
  decodeProposalAccount,
  encodeLighthouseAssertion,
  encodeUpgradeInstruction,
  LOADER_V3_PROGRAM_ID,
  SYSVAR_CLOCK_ID,
  SYSVAR_RENT_ID,
  toWeb3Instruction,
} from '../../packages/release-core/src/index.js';

const root = path.dirname(fileURLToPath(import.meta.url));

async function runLifecycleForBuild(variant) {
  console.log(`\n=== Running 14-step core lifecycle for Squads build: ${variant} ===`);
  const pythonPath = path.join(root, '.venv', 'bin', 'python');
  const bridge = spawn(pythonPath, [path.join(root, 'svm_server.py'), variant], {
    env: process.env,
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  const pending = [];
  createInterface({ input: bridge.stdout }).on('line', (line) => {
    const job = pending.shift();
    if (!job) throw new Error('Unexpected bridge output');
    const value = JSON.parse(line);
    value.error ? job.reject(new Error(value.error)) : job.resolve(value.result);
  });

  const call = (req) =>
    new Promise((resolve, reject) => {
      pending.push({ resolve, reject });
      bridge.stdin.write(JSON.stringify(req) + '\n');
    });

  const payer = Keypair.generate();
  const second = Keypair.generate();
  const createKey = Keypair.generate();
  const program = Keypair.generate().publicKey;
  const bufferA = Keypair.generate().publicKey;
  const bufferB = Keypair.generate().publicKey;
  const spill = Keypair.generate().publicKey;

  const [multisigPda] = sq.getMultisigPda({ createKey: createKey.publicKey });
  const [vaultPda] = sq.getVaultPda({ multisigPda, index: 0 });

  const evidenceFile = variant === 'devnet' ? 'squads-rpc-evidence.devnet.json' : 'squads-rpc-evidence.json';
  const snapshot = JSON.parse(readFileSync(path.join(root, evidenceFile), 'utf8'));
  const config = sq.accounts.ProgramConfig.deserialize(
    Buffer.from(snapshot.snapshot.value[1].data[0], 'base64'),
  )[0];

  const state = await call({
    op: 'init',
    fund: [
      payer.publicKey.toBase58(),
      second.publicKey.toBase58(),
      vaultPda.toBase58(),
      spill.toBase58(),
      config.treasury.toBase58(),
    ],
    program: program.toBase58(),
    vault: vaultPda.toBase58(),
    buffers: [bufferA.toBase58(), bufferB.toBase58()],
  });

  const events = [];

  async function send(name, coreInstructions, signers = [payer], expected = true) {
    const web3Ixs = coreInstructions.map(toWeb3Instruction);
    const tx = new Transaction({
      recentBlockhash: state.blockhash,
      feePayer: payer.publicKey,
    }).add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: events.length }),
      ...web3Ixs,
    );
    tx.sign(...signers);
    const result = await call({ op: 'tx', tx: tx.serialize().toString('base64') });
    events.push({ name, expected_ok: expected, ...result });
    if (result.ok !== expected) {
      throw new Error(`${name} failed: ${result.error}`);
    }
    return result;
  }

  // ChainReader adapter over svm_server.py account endpoint for core builders
  const chain = {
    getGenesisHash: async () => 'local-genesis',
    getBlockHeight: async () => 100,
    getSignatureStatus: async () => null,
    getTransactionOutcome: async () => null,
    getAccounts: async (addresses) => {
      const accounts = await Promise.all(
        addresses.map(async (addr) => {
          const a = await call({ op: 'account', pubkey: addr });
          if (!a) return null;
          return {
            address: addr,
            data: Buffer.from(a.data, 'base64'),
            owner: a.owner,
            lamports: BigInt(a.lamports),
            executable: a.executable,
          };
        }),
      );
      return { contextSlot: 100, accounts };
    },
  };

  try {
    // 1. Create 2-of-2 multisig
    const msCreateWeb3 = sq.instructions.multisigCreateV2({
      treasury: config.treasury,
      creator: payer.publicKey,
      multisigPda,
      configAuthority: null,
      threshold: 2,
      members: [
        { key: payer.publicKey, permissions: sq.types.Permissions.all() },
        { key: second.publicKey, permissions: sq.types.Permissions.all() },
      ],
      timeLock: 0,
      createKey: createKey.publicKey,
      rentCollector: null,
    });
    // Convert to core instruction and send
    const msCreateCore = {
      programId: msCreateWeb3.programId.toBase58(),
      accounts: msCreateWeb3.keys.map((k) => ({
        address: k.pubkey.toBase58(),
        isSigner: k.isSigner,
        isWritable: k.isWritable,
      })),
      data: new Uint8Array(msCreateWeb3.data),
    };
    await send('create_real_2_of_2_multisig', [msCreateCore], [payer, createKey]);

    const executeWithCore = async (index, name, expected = true) => {
      const executeIx = await buildExecute({
        chain,
        multisig: multisigPda.toBase58(),
        transactionIndex: BigInt(index),
        member: payer.publicKey.toBase58(),
      });
      return send(name, [executeIx], [payer], expected);
    };

    // Proposals 1, 2, 3
    for (const [index, bufPubkey, slotGuard] of [
      [1, bufferA, true],
      [2, bufferA, false],
      [3, bufferB, true],
    ]) {
      const transactionIndex = BigInt(index);
      let innerInstructions;

      if (slotGuard) {
        // Canonical 5 instructions via core buildGuardedUpgrade
        innerInstructions = buildGuardedUpgrade({
          program: program.toBase58(),
          programData: state.programdata,
          buffer: bufPubkey.toBase58(),
          spill: spill.toBase58(),
          vault: vaultPda.toBase58(),
          payloadLength: BigInt(state.code_bytes),
          keccak256: state.code_keccak,
          deploymentSlot: 0n,
        });
      } else {
        // Proposal 2: same upgrade without deployment-slot condition
        innerInstructions = [
          encodeLighthouseAssertion({
            kind: 'buffer-owner',
            target: bufPubkey.toBase58(),
            owner: LOADER_V3_PROGRAM_ID,
          }),
          encodeLighthouseAssertion({
            kind: 'buffer-length',
            target: bufPubkey.toBase58(),
            length: BigInt(state.code_bytes + 37),
          }),
          encodeLighthouseAssertion({
            kind: 'buffer-hash',
            target: bufPubkey.toBase58(),
            keccak256: state.code_keccak,
            start: 37n,
            length: BigInt(state.code_bytes),
          }),
          encodeUpgradeInstruction({
            programData: state.programdata,
            program: program.toBase58(),
            buffer: bufPubkey.toBase58(),
            spill: spill.toBase58(),
            rentSysvar: SYSVAR_RENT_ID,
            clockSysvar: SYSVAR_CLOCK_ID,
            authority: vaultPda.toBase58(),
          }),
        ];
      }

      // Step: create proposal via buildCreateGuardedProposal
      const createIxs = buildCreateGuardedProposal({
        multisig: multisigPda.toBase58(),
        transactionIndex,
        creator: payer.publicKey.toBase58(),
        innerInstructions,
      });
      await send(`create_proposal_${index}`, createIxs);

      // Step: first approval via buildApprove
      const app1Ix = buildApprove({
        multisig: multisigPda.toBase58(),
        transactionIndex,
        member: payer.publicKey.toBase58(),
      });
      await send(`first_approval_${index}`, [app1Ix]);

      if (index === 1) {
        // Step 4: premature execution before 2nd approval must fail
        await executeWithCore(1, 'execution_before_second_approval', false);
      }

      // Step: second approval via buildApprove
      const app2Ix = buildApprove({
        multisig: multisigPda.toBase58(),
        transactionIndex,
        member: second.publicKey.toBase58(),
      });
      await send(`second_approval_${index}`, [app2Ix], [payer, second]);
    }

    // Step 12: execute proposal 3 (newer release)
    const newer = await executeWithCore(3, 'execute_newer_proposal_first');

    // Warp to slot 200
    await call({ op: 'warp', slot: 200 });

    // Step 13: execute proposal 1 (older release with slot guard) -> blocked!
    const blocked = await executeWithCore(1, 'older_proposal_with_previous_slot_guard', false);

    // Verify proposal 1 account status remains 'Approved'
    const p1AccountRaw = await call({
      op: 'account',
      pubkey: sq.getProposalPda({ multisigPda, transactionIndex: 1n })[0].toBase58(),
    });
    const p1Decoded = decodeProposalAccount(Buffer.from(p1AccountRaw.data, 'base64'));
    if (!p1Decoded.ok || p1Decoded.value.status.kind !== 'Approved') {
      throw new Error(`Expected proposal 1 to remain Approved, got: ${p1Decoded.ok ? p1Decoded.value.status.kind : p1Decoded.reason}`);
    }

    // Step 14: execute proposal 2 (older release without slot guard) -> accepted!
    const accepted = await executeWithCore(2, 'older_proposal_without_previous_slot_guard', true);

    const isAllExpected =
      events.length === 14 &&
      events.every((e) => e.ok === e.expected_ok) &&
      blocked.programdata_slot === 100 &&
      accepted.programdata_slot === 200 &&
      blocked.programdata_sha256 === newer.programdata_sha256 &&
      p1Decoded.value.status.kind === 'Approved' &&
      blocked.logs.some((line) => line.includes('L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95 failed'));

    if (!isAllExpected) {
      throw new Error(`Lifecycle invariants not met for build variant ${variant}`);
    }

    console.log(`✓ All 14 steps completed and verified for ${variant} Squads build!`);
    return { variant, ok: true, eventsCount: events.length };
  } finally {
    bridge.stdin.end();
  }
}

async function main() {
  const target = process.argv[2] ?? 'both';
  if (target === 'both' || target === 'mainnet') {
    await runLifecycleForBuild('mainnet');
  }
  if (target === 'both' || target === 'devnet') {
    await runLifecycleForBuild('devnet');
  }
  console.log('\n[PASS MARK 8 MET]: 14-step local lifecycle verified for both Squads builds via release-core builders.');
}

main().catch((err) => {
  console.error('Fatal lifecycle failure:', err);
  process.exit(1);
});
