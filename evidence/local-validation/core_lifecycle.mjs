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
  evaluate,
  getClusterDescriptor,
  getMemberCapabilities,
  keccak256,
  LOADER_V3_PROGRAM_ID,
  MANIFEST_SCHEMA_V1,
  parsePermissions,
  readDeploymentState,
  readProposal,
  reconcileDeployment,
  sha256,
  SYSVAR_CLOCK_ID,
  SYSVAR_RENT_ID,
  toWeb3Instruction,
  verify,
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

  const bytecode = readFileSync(path.join(root, 'lighthouse-onchain.so'));
  const codeSha256 = sha256(bytecode);
  const codeKeccak = keccak256(bytecode);

  const cluster = getClusterDescriptor('devnet');

  const reviewedArtifact = {
    sha256: codeSha256,
    keccak256: codeKeccak,
    length: bytecode.length,
    bytes: new Uint8Array(bytecode),
  };

  const releaseManifest = {
    schema: MANIFEST_SCHEMA_V1,
    release: {
      name: 'lighthouse',
      version: '1.0.0',
    },
    cluster: {
      name: 'devnet',
      genesisHash: cluster.genesisHash,
    },
    multisig: multisigPda.toBase58(),
    vaultIndex: 0,
    vault: vaultPda.toBase58(),
    program: program.toBase58(),
    expectedDeploymentSlot: 0n,
    artifact: {
      fileName: 'lighthouse-onchain.so',
      sha256: codeSha256,
      keccak256: codeKeccak,
      length: bytecode.length,
    },
    provenance: {
      sourceRepository: 'https://github.com/solana-program/lighthouse',
      commit: '0123456789abcdef0123456789abcdef01234567',
      buildMethod: 'solana-verify',
      builder: 'docker',
      builtAt: '2026-10-10T00:00:00Z',
    },
  };

  const releaseObj = {
    id: 'rel-local',
    manifest: releaseManifest,
    manifestSha256: sha256(
      new TextEncoder().encode(
        JSON.stringify(releaseManifest, (_, v) => (typeof v === 'bigint' ? Number(v) : v))
      )
    ),
    artifact: reviewedArtifact,
    artifactSource: {
      channel: 'file-picker',
      size: bytecode.length,
      importedAt: new Date().toISOString(),
    },
    manifestSource: {
      channel: 'file-picker',
      size: 100,
      importedAt: new Date().toISOString(),
    },
    attestation: {
      statementVersion: '1.0.0',
      confirmedAt: new Date().toISOString(),
    },
  };

  let currentSlot = 100;
  // ChainReader adapter over svm_server.py account endpoint for core builders
  const chain = {
    getGenesisHash: async () => cluster.genesisHash,
    getBlockHeight: async () => currentSlot,
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
      return { contextSlot: currentSlot, accounts };
    },
  };

  async function assertProposalJudgment(txIndex, {
    expectedStatusKind,
    expectedGuardShape,
    expectedArtifactMatch,
    expectedExecutionConditions,
    expectedCanApprove,
    expectedCanExecute,
    customRelease = releaseObj,
  }) {
    const inspection = await readProposal(chain, {
      multisig: multisigPda.toBase58(),
      transactionIndex: BigInt(txIndex),
    });

    if (expectedStatusKind && inspection.proposal.status.kind !== expectedStatusKind) {
      throw new Error(
        `Proposal ${txIndex} status mismatch: expected ${expectedStatusKind}, got ${inspection.proposal.status.kind}`
      );
    }

    if (expectedGuardShape && inspection.guard.shape !== expectedGuardShape) {
      throw new Error(
        `Proposal ${txIndex} guard shape mismatch: expected ${expectedGuardShape}, got ${inspection.guard.shape}`
      );
    }

    const checks = verify({
      workspace: {
        clusterId: cluster.id,
        multisig: multisigPda.toBase58(),
        rpcGenesisHash: cluster.genesisHash,
      },
      multisig: inspection.multisig,
      proposal: inspection.proposal,
      storedTransaction: inspection.transaction,
      guardAssessment: inspection.guard,
      classifiedInstructions: inspection.instructions,
      chainEvidence: inspection.evidence,
      release: customRelease,
    });

    const payerCapabilities = getMemberCapabilities(
      inspection.multisig.members,
      payer.publicKey.toBase58()
    );
    const verdict = evaluate({
      checks,
      shape: inspection.guard.shape,
      cluster,
      multisig: inspection.multisig,
      proposal: inspection.proposal,
      memberAddress: payer.publicKey.toBase58(),
      memberCapabilities: payerCapabilities,
      currentTimeSeconds: 1000,
      hasReviewedArtifact: true,
    });

    if (expectedArtifactMatch && verdict.artifactMatch !== expectedArtifactMatch) {
      throw new Error(
        `Proposal ${txIndex} artifactMatch mismatch: expected ${expectedArtifactMatch}, got ${verdict.artifactMatch}`
      );
    }

    if (expectedExecutionConditions && verdict.executionConditions !== expectedExecutionConditions) {
      throw new Error(
        `Proposal ${txIndex} executionConditions mismatch: expected ${expectedExecutionConditions}, got ${verdict.executionConditions}`
      );
    }

    if (expectedCanApprove !== undefined && verdict.actions.approve.allowed !== expectedCanApprove) {
      const failing = checks.filter((c) => c.status !== 'pass').map((c) => `${c.id}:${c.status}(${c.reason})`);
      throw new Error(
        `Proposal ${txIndex} canApprove mismatch: expected ${expectedCanApprove}, got ${verdict.actions.approve.allowed} (${verdict.actions.approve.reasons.join('; ')}). Failing checks: ${failing.join(', ')}`
      );
    }

    if (expectedCanExecute !== undefined && verdict.actions.execute.allowed !== expectedCanExecute) {
      throw new Error(
        `Proposal ${txIndex} canExecute mismatch: expected ${expectedCanExecute}, got ${verdict.actions.execute.allowed} (${verdict.actions.execute.reasons.join('; ')})`
      );
    }

    return { inspection, checks, verdict };
  }

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

      if (index === 1) {
        // Snapshot: right after proposal 1 creation
        await assertProposalJudgment(1, {
          expectedStatusKind: 'Active',
          expectedGuardShape: 'guarded-upgrade',
          expectedArtifactMatch: 'matches',
          expectedExecutionConditions: 'verified',
          expectedCanApprove: true,
          expectedCanExecute: false,
        });
      }

      // Step: first approval via buildApprove
      const app1Ix = buildApprove({
        multisig: multisigPda.toBase58(),
        transactionIndex,
        member: payer.publicKey.toBase58(),
      });
      await send(`first_approval_${index}`, [app1Ix]);

      if (index === 1) {
        // Snapshot: after proposal 1 first approval
        await assertProposalJudgment(1, {
          expectedStatusKind: 'Active',
          expectedGuardShape: 'guarded-upgrade',
          expectedArtifactMatch: 'matches',
          expectedExecutionConditions: 'verified',
          expectedCanApprove: false, // payer already voted
          expectedCanExecute: false, // threshold 2 not met
        });
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

      if (index === 1) {
        await assertProposalJudgment(1, {
          expectedStatusKind: 'Approved',
          expectedGuardShape: 'guarded-upgrade',
          expectedArtifactMatch: 'matches',
          expectedExecutionConditions: 'verified',
          expectedCanApprove: false,
          expectedCanExecute: true,
        });
      } else if (index === 2) {
        const { verdict: v2 } = await assertProposalJudgment(2, {
          expectedStatusKind: 'Approved',
          expectedGuardShape: 'partial-guard',
          expectedArtifactMatch: 'matches',
          expectedExecutionConditions: 'incomplete',
          expectedCanExecute: false, // Incomplete guard blocks execution!
        });
        if (!v2.actions.createGuardedReplacement.allowed) {
          throw new Error('Expected createGuardedReplacement to be allowed for partial-guard proposal 2');
        }
      } else if (index === 3) {
        await assertProposalJudgment(3, {
          expectedStatusKind: 'Approved',
          expectedGuardShape: 'guarded-upgrade',
          expectedArtifactMatch: 'matches',
          expectedExecutionConditions: 'verified',
          expectedCanExecute: true,
        });

        // Test one-byte mutated artifact giving 'mismatch' (Pass Mark 5)
        const mutatedRelease = {
          ...releaseObj,
          artifact: {
            ...releaseObj.artifact,
            sha256: '0'.repeat(64),
          },
        };
        await assertProposalJudgment(3, {
          expectedArtifactMatch: 'mismatch',
          customRelease: mutatedRelease,
        });
      }
    }

    // Step 12: execute proposal 3 (newer release)
    const newer = await executeWithCore(3, 'execute_newer_proposal_first');

    // Reconcile deployment receipt on proposal 3 (Pass Mark 6)
    const depState = await readDeploymentState({
      chain,
      program: program.toBase58(),
      bufferAddress: bufferB.toBase58(),
    });
    const receipt = reconcileDeployment({
      clusterId: cluster.id,
      genesisHash: cluster.genesisHash,
      multisig: multisigPda.toBase58(),
      transactionIndex: 3n,
      vault: vaultPda.toBase58(),
      program: program.toBase58(),
      expectedDeploymentSlot: 0n,
      artifactSha256: codeSha256,
      artifactKeccak256: codeKeccak,
      artifactLength: bytecode.length,
      artifactBytes: new Uint8Array(bytecode),
      manifestSha256: releaseObj.manifestSha256,
      deploymentState: depState,
      createdAt: new Date().toISOString(),
    });

    if (
      receipt.deployed.slot !== 100n ||
      receipt.deployed.upgradeAuthority !== vaultPda.toBase58() ||
      !receipt.deployed.bufferClosed ||
      !receipt.deployed.payloadMatchesArtifact ||
      !receipt.deployed.trailingBytesAllZero ||
      !receipt.checks.every((c) => c.status === 'pass')
    ) {
      throw new Error(`Receipt verification failed on proposal 3`);
    }

    // Receipt failure cases per Pass Mark 6:
    // 1. Wrong payload
    const wrongBytes = new Uint8Array(bytecode);
    wrongBytes[0] ^= 0xff;
    const receiptWrongPayload = reconcileDeployment({
      clusterId: cluster.id,
      genesisHash: cluster.genesisHash,
      multisig: multisigPda.toBase58(),
      transactionIndex: 3n,
      vault: vaultPda.toBase58(),
      program: program.toBase58(),
      expectedDeploymentSlot: 0n,
      artifactSha256: 'f'.repeat(64),
      artifactKeccak256: codeKeccak,
      artifactLength: bytecode.length,
      artifactBytes: wrongBytes,
      manifestSha256: releaseObj.manifestSha256,
      deploymentState: depState,
      createdAt: new Date().toISOString(),
    });
    if (receiptWrongPayload.deployed.payloadMatchesArtifact !== false) {
      throw new Error('Expected wrong payload to fail receipt check');
    }

    // 2. Wrong authority
    const receiptWrongAuthority = reconcileDeployment({
      clusterId: cluster.id,
      genesisHash: cluster.genesisHash,
      multisig: multisigPda.toBase58(),
      transactionIndex: 3n,
      vault: payer.publicKey.toBase58(),
      program: program.toBase58(),
      expectedDeploymentSlot: 0n,
      artifactSha256: codeSha256,
      artifactKeccak256: codeKeccak,
      artifactLength: bytecode.length,
      artifactBytes: new Uint8Array(bytecode),
      manifestSha256: releaseObj.manifestSha256,
      deploymentState: depState,
      createdAt: new Date().toISOString(),
    });
    if (receiptWrongAuthority.checks.find((c) => c.id === 'programdata.authority')?.status !== 'fail') {
      throw new Error('Expected wrong authority to fail receipt check');
    }

    // 3. Buffer still existing
    const receiptBufferNotClosed = reconcileDeployment({
      clusterId: cluster.id,
      genesisHash: cluster.genesisHash,
      multisig: multisigPda.toBase58(),
      transactionIndex: 3n,
      vault: vaultPda.toBase58(),
      program: program.toBase58(),
      expectedDeploymentSlot: 0n,
      artifactSha256: codeSha256,
      artifactKeccak256: codeKeccak,
      artifactLength: bytecode.length,
      artifactBytes: new Uint8Array(bytecode),
      manifestSha256: releaseObj.manifestSha256,
      deploymentState: {
        ...depState,
        bufferAccount: {
          address: bufferB.toBase58(),
          lamports: 1000000n,
          owner: LOADER_V3_PROGRAM_ID,
          data: new Uint8Array([1, 0, 0, 0]),
          executable: false,
        },
      },
      createdAt: new Date().toISOString(),
    });
    if (receiptBufferNotClosed.deployed.bufferClosed !== false) {
      throw new Error('Expected unclosed buffer to fail receipt check');
    }

    // Assert proposal 1 status after proposal 3 execution: not-holding, execute disallowed (Pass Mark 5)
    await assertProposalJudgment(1, {
      expectedStatusKind: 'Approved',
      expectedGuardShape: 'guarded-upgrade',
      expectedArtifactMatch: 'matches',
      expectedExecutionConditions: 'not-holding',
      expectedCanExecute: false,
    });

    // Warp to slot 200
    await call({ op: 'warp', slot: 200 });
    currentSlot = 200;

    // Step 13: execute proposal 1 (older release with slot guard) -> blocked!
    const blocked = await executeWithCore(1, 'older_proposal_with_previous_slot_guard', false);

    // Verify core verdict for proposal 1 continues to report not-holding and execute disallowed
    await assertProposalJudgment(1, {
      expectedStatusKind: 'Approved',
      expectedGuardShape: 'guarded-upgrade',
      expectedArtifactMatch: 'matches',
      expectedExecutionConditions: 'not-holding',
      expectedCanExecute: false,
    });

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

    const p2Final = await readProposal(chain, {
      multisig: multisigPda.toBase58(),
      transactionIndex: 2n,
    });
    if (p2Final.proposal.status.kind !== 'Executed') {
      throw new Error(`Expected proposal 2 to be Executed, got ${p2Final.proposal.status.kind}`);
    }

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
  console.log('\n[PASS MARK 9 MET]: 14-step local lifecycle verified for both Squads builds with core reader, verification, verdict, and receipt assertions.');
}

main().catch((err) => {
  console.error('Fatal lifecycle failure:', err);
  process.exit(1);
});
