import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PublicKey } from '@solana/web3.js';
import { sha256 } from '../../src/digest/sha256';
import { keccak256 } from '../../src/digest/keccak256';
import { deriveVaultPda } from '../../src/squads/addresses';
import { reconcileDeployment, type ReconcileDeploymentInput } from '../../src/receipt/reconcile';
import type { DeploymentState } from '../../src/receipt/read-deployment';

describe('deployment receipt reconciliation (Pass Mark 6)', () => {
  const MULTISIG = 'DFjKzxhsoeikC8QWW8sDPvbWynExDQaMrehYyibxVqbF';
  const VAULT = deriveVaultPda(MULTISIG, 0).address;
  const PROGRAM = '11111111111111111111111111111111';
  const PROGRAM_DATA_ADDRESS = 'Fy3YMJCvwbAXUgUM5b91ucUVA3jYzwWLHL3MwBqKsh8n';

  // Construct synthetic 100-byte artifact
  const artifactBytes = new Uint8Array(100);
  for (let i = 0; i < 100; i++) artifactBytes[i] = (i * 7 + 3) & 0xff;
  const artifactSha256Hex = sha256(artifactBytes);
  const artifactKeccak256Hex = keccak256(artifactBytes);

  function buildProgramDataAccountBytes(options?: {
    slot?: bigint;
    authority?: string;
    payload?: Uint8Array;
    trailingLength?: number;
    trailingNonZero?: boolean;
  }): Uint8Array {
    const slot = options?.slot ?? 100n;
    const authority = options?.authority ?? VAULT;
    const payload = options?.payload ?? artifactBytes;
    const trailingLength = options?.trailingLength ?? 20;

    const totalLength = 45 + payload.length + trailingLength;
    const data = new Uint8Array(totalLength);
    const view = new DataView(data.buffer);

    // 4-byte variant tag 3 = ProgramData
    view.setUint32(0, 3, true);
    // 8-byte LE slot
    view.setBigUint64(4, slot, true);
    // 1-byte Option::Some
    data[12] = 1;
    // 32-byte authority pubkey
    const authPubkey = new PublicKey(authority);
    data.set(authPubkey.toBytes(), 13);

    // Payload starting at offset 45
    data.set(payload, 45);

    // Trailing bytes (all zero by default, or non-zero if requested)
    if (options?.trailingNonZero) {
      data[45 + payload.length + 5] = 0xee;
    }

    return data;
  }

  function createValidBaselineState(): { input: ReconcileDeploymentInput; state: DeploymentState } {
    const pdataBytes = buildProgramDataAccountBytes();
    const state: DeploymentState = {
      programAddress: PROGRAM,
      programDataAddress: PROGRAM_DATA_ADDRESS,
      bufferAddress: 'BufferB11111111111111111111111111111111111',
      programAccount: {
        address: PROGRAM,
        owner: 'BPFLoaderUpgradeab1e11111111111111111111111',
        executable: true,
        lamports: 1000000n,
        data: new Uint8Array(36),
      },
      programDataAccount: {
        address: PROGRAM_DATA_ADDRESS,
        owner: 'BPFLoaderUpgradeab1e11111111111111111111111',
        executable: false,
        lamports: 2953970160n,
        data: pdataBytes,
      },
      bufferAccount: null, // Buffer closed!
      transactionOutcome: {
        slot: 100,
        error: null,
        logs: ['Program BPFLoaderUpgradeab1e11111111111111111111111 success'],
      },
      contextSlot: 100,
    };

    const input: ReconcileDeploymentInput = {
      clusterId: 'devnet',
      genesisHash: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
      multisig: MULTISIG,
      transactionIndex: 3n,
      vault: VAULT,
      program: PROGRAM,
      expectedDeploymentSlot: 0n,
      artifactSha256: artifactSha256Hex,
      artifactKeccak256: artifactKeccak256Hex,
      artifactLength: artifactBytes.length,
      artifactBytes,
      manifestSha256: 'manifest_sha256_mock',
      deploymentState: state,
      executionInfo: {
        signature: 'mock_sig_123',
        slot: 100,
        observedOnly: false,
      },
      commitment: 'confirmed',
      createdAt: '2026-10-10T12:00:00Z',
    };

    return { input, state };
  }

  it('reconciles valid post-execution state for proposal 3: slot 100, vault authority, matching payload, buffer closed', () => {
    const { input } = createValidBaselineState();
    const receipt = reconcileDeployment(input);

    assert.equal(receipt.deployed.slot, 100n);
    assert.equal(receipt.deployed.payloadMatchesArtifact, true);
    assert.equal(receipt.deployed.trailingBytesAllZero, true);
    assert.equal(receipt.deployed.bufferClosed, true);
    assert.equal(receipt.execution.observedOnly, false);

    assert.equal(receipt.checks.length, 5);
    for (const check of receipt.checks) {
      assert.equal(check.status, 'pass', `Check ${check.id} should pass`);
    }
  });

  it('payload mismatch fails buffer.bytes check', () => {
    const { input, state } = createValidBaselineState();
    const corruptedPayload = new Uint8Array(artifactBytes);
    corruptedPayload[10] = 0xff; // One byte changed!

    const corruptedPdata = buildProgramDataAccountBytes({ payload: corruptedPayload });
    const modifiedState: DeploymentState = {
      ...state,
      programDataAccount: {
        ...state.programDataAccount!,
        data: corruptedPdata,
      },
    };

    const receipt = reconcileDeployment({ ...input, deploymentState: modifiedState });
    assert.equal(receipt.deployed.payloadMatchesArtifact, false);

    const bytesCheck = receipt.checks.find(c => c.id === 'buffer.bytes')!;
    assert.equal(bytesCheck.status, 'fail');
    assert.match(bytesCheck.detail!, /does not match/i);
  });

  it('wrong authority fails programdata.authority check', () => {
    const { input } = createValidBaselineState();
    // Pass different vault
    const receipt = reconcileDeployment({
      ...input,
      vault: 'DifferentVault1111111111111111111111111111111',
    });
    assert.equal(receipt.deployed.upgradeAuthority, VAULT);

    const authCheck = receipt.checks.find(c => c.id === 'programdata.authority')!;
    assert.equal(authCheck.status, 'fail');
  });

  it('still-existing buffer fails buffer.state check', () => {
    const { input, state } = createValidBaselineState();
    const openBufferState: DeploymentState = {
      ...state,
      bufferAccount: {
        address: 'BufferAccountStillOpen11111111111111111111',
        owner: 'BPFLoaderUpgradeab1e11111111111111111111111',
        executable: false,
        lamports: 5000000n, // non-zero lamports!
        data: new Uint8Array(100),
      },
    };

    const receipt = reconcileDeployment({ ...input, deploymentState: openBufferState });
    assert.equal(receipt.deployed.bufferClosed, false);

    const bufferStateCheck = receipt.checks.find(c => c.id === 'buffer.state')!;
    assert.equal(bufferStateCheck.status, 'fail');
  });

  it('non-zero trailing bytes fails buffer.length check', () => {
    const { input, state } = createValidBaselineState();
    const nonZeroTrailing = buildProgramDataAccountBytes({ trailingNonZero: true });
    const modifiedState: DeploymentState = {
      ...state,
      programDataAccount: {
        ...state.programDataAccount!,
        data: nonZeroTrailing,
      },
    };

    const receipt = reconcileDeployment({ ...input, deploymentState: modifiedState });
    assert.equal(receipt.deployed.trailingBytesAllZero, false);

    const trailingCheck = receipt.checks.find(c => c.id === 'buffer.length')!;
    assert.equal(trailingCheck.status, 'fail');
  });

  it('observed-only receipts: allowed when slot matches, rejected when slot advanced', () => {
    const { input } = createValidBaselineState();

    // 1. Observed-only with matching slot: succeeds
    const observedReceipt = reconcileDeployment({
      ...input,
      executionInfo: { slot: 100, observedOnly: true },
    });
    assert.equal(observedReceipt.execution.observedOnly, true);
    assert.equal(observedReceipt.deployed.slot, 100n);

    // 2. Observed-only when ProgramData.slot advanced to 200 (superseded release): throws error
    assert.throws(
      () =>
        reconcileDeployment({
          ...input,
          executionInfo: { slot: 50, observedOnly: true }, // executed at slot 50, but deployed is 100
        }),
      /cannot produce observed-only receipt/i
    );
  });
});
