import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkOperationEffect } from '../../src/settlement/effects';
import { settle } from '../../src/settlement/settle';
import type { Operation } from '../../src/settlement/operation';
import type { OperationObservation } from '../../src/settlement/observe';
import type { ProposalSnapshot } from '../../src/inspection/read-proposal';
import type { StoredTransaction } from '../../src/squads/stored-transaction';

describe('operation settlement and effect predicates (Pass Mark 7)', () => {
  const MEMBER = 'DFjKzxhsoeikC8QWW8sDPvbWynExDQaMrehYyibxVqbF';
  const OTHER_MEMBER = 'AnotherMember111111111111111111111111111111';
  const MULTISIG = 'MultisigAddress1111111111111111111111111111';
  const MESSAGE_HASH = 'abc123expectedMessageSha256Hash';

  function createBaseOperation(kind: Operation['kind'], phase: Operation['phase'] = 'submitted'): Operation {
    return {
      id: `op-${kind}-1`,
      kind,
      clusterId: 'devnet',
      multisig: MULTISIG,
      transactionIndex: 1n,
      member: MEMBER,
      phase,
      submission: 'app-rpc',
      signature: 'signature_abc123',
      blockhash: 'blockhash_123',
      lastValidBlockHeight: 1000,
      expectedMessageSha256: MESSAGE_HASH,
      createdAt: '2026-10-10T10:00:00Z',
      updatedAt: '2026-10-10T10:00:00Z',
    };
  }

  describe('Table 1: Effect predicates', () => {
    it('approve: member in approved list is true, otherwise false', () => {
      const op = createBaseOperation('approve');
      const propApproved: ProposalSnapshot = {
        multisig: MULTISIG,
        transactionIndex: 1n,
        status: { kind: 'Active', timestamp: 100n },
        approved: [MEMBER],
        rejected: [],
        cancelled: [],
        contextSlot: 10,
      };
      assert.equal(checkOperationEffect({ operation: op, proposal: propApproved }), true);

      const propNotApproved: ProposalSnapshot = {
        ...propApproved,
        approved: [OTHER_MEMBER],
      };
      assert.equal(checkOperationEffect({ operation: op, proposal: propNotApproved }), false);

      assert.equal(checkOperationEffect({ operation: op, proposal: null }), false);
    });

    it('reject: member in rejected list is true, otherwise false', () => {
      const op = createBaseOperation('reject');
      const propRejected: ProposalSnapshot = {
        multisig: MULTISIG,
        transactionIndex: 1n,
        status: { kind: 'Active', timestamp: 100n },
        approved: [],
        rejected: [MEMBER],
        cancelled: [],
        contextSlot: 10,
      };
      assert.equal(checkOperationEffect({ operation: op, proposal: propRejected }), true);

      const propNotRejected: ProposalSnapshot = {
        ...propRejected,
        rejected: [OTHER_MEMBER],
      };
      assert.equal(checkOperationEffect({ operation: op, proposal: propNotRejected }), false);
    });

    it('create-guarded-proposal: transaction account with matching messageSha256 and proposal exist is true', () => {
      const op = createBaseOperation('create-guarded-proposal');
      const prop: ProposalSnapshot = {
        multisig: MULTISIG,
        transactionIndex: 1n,
        status: { kind: 'Draft' },
        approved: [],
        rejected: [],
        cancelled: [],
        contextSlot: 10,
      };
      const tx: StoredTransaction = {
        kind: 'vault',
        address: 'txPda',
        accounts: [],
        instructions: [],
        lookupTableCount: 0,
        messageSha256: MESSAGE_HASH,
        contextSlot: 10,
      };

      assert.equal(checkOperationEffect({ operation: op, proposal: prop, storedTransaction: tx }), true);

      // Different message hash
      const txWrongHash: StoredTransaction = { ...tx, messageSha256: 'differentHash' };
      assert.equal(checkOperationEffect({ operation: op, proposal: prop, storedTransaction: txWrongHash }), false);

      // Missing proposal or tx
      assert.equal(checkOperationEffect({ operation: op, proposal: null, storedTransaction: tx }), false);
      assert.equal(checkOperationEffect({ operation: op, proposal: prop, storedTransaction: null }), false);
    });

    it('execute: proposal status Executed is true, otherwise false', () => {
      const op = createBaseOperation('execute');
      const propExecuted: ProposalSnapshot = {
        multisig: MULTISIG,
        transactionIndex: 1n,
        status: { kind: 'Executed', timestamp: 200n },
        approved: [MEMBER],
        rejected: [],
        cancelled: [],
        contextSlot: 20,
      };
      assert.equal(checkOperationEffect({ operation: op, proposal: propExecuted }), true);

      const propApproved: ProposalSnapshot = {
        ...propExecuted,
        status: { kind: 'Approved', timestamp: 100n },
      };
      assert.equal(checkOperationEffect({ operation: op, proposal: propApproved }), false);
    });
  });

  describe('Table 2: Observation to Phase transitions', () => {
    it('Row 1: Effect present -> confirmed (even when signature is unknown)', () => {
      const opWithoutSig: Operation = {
        ...createBaseOperation('approve'),
        signature: undefined,
      };
      const obs: OperationObservation = {
        proposal: {
          multisig: MULTISIG,
          transactionIndex: 1n,
          status: { kind: 'Active' },
          approved: [MEMBER],
          rejected: [],
          cancelled: [],
          contextSlot: 10,
        },
      };

      const settled = settle(opWithoutSig, obs);
      assert.equal(settled.phase, 'confirmed');
      assert.match(settled.resolution!, /confirmed/i);
    });

    it('Row 2: Wallet reported user refusal before anything was signed -> declined', () => {
      const op = createBaseOperation('approve', 'handed-off');
      const obs: OperationObservation = {
        userDeclined: true,
      };

      const settled = settle(op, obs);
      assert.equal(settled.phase, 'declined');
      assert.match(settled.resolution!, /declined/i);
    });

    it('Row 3: Signature known and its status is an error -> failed', () => {
      const op = createBaseOperation('execute');
      const obs: OperationObservation = {
        signatureStatus: {
          slot: 50,
          confirmations: 10,
          err: { InstructionError: [0, 'Custom(6001)'] },
        },
      };

      const settled = settle(op, obs);
      assert.equal(settled.phase, 'failed');
      assert.match(settled.resolution!, /failed/i);
    });

    it('Row 4: Effect absent, block height beyond lastValidBlockHeight, signature not found -> expired', () => {
      const op = createBaseOperation('approve'); // lastValidBlockHeight = 1000
      const obs: OperationObservation = {
        proposal: {
          multisig: MULTISIG,
          transactionIndex: 1n,
          status: { kind: 'Active' },
          approved: [], // effect absent!
          rejected: [],
          cancelled: [],
          contextSlot: 10,
        },
        currentBlockHeight: 1005, // past lastValidBlockHeight
        signatureStatus: null, // signature not found
      };

      const settled = settle(op, obs);
      assert.equal(settled.phase, 'expired');
      assert.match(settled.resolution!, /expired/i);
    });

    it('Row 5: create-guarded-proposal only: planned index holds a different message -> superseded', () => {
      const op = createBaseOperation('create-guarded-proposal');
      const obs: OperationObservation = {
        proposal: {
          multisig: MULTISIG,
          transactionIndex: 1n,
          status: { kind: 'Draft' },
          approved: [],
          rejected: [],
          cancelled: [],
          contextSlot: 10,
        },
        storedTransaction: {
          kind: 'vault',
          address: 'txPda',
          accounts: [],
          instructions: [],
          lookupTableCount: 0,
          messageSha256: 'someoneElseMessageDigest789', // Different message!
          contextSlot: 10,
        },
      };

      const settled = settle(op, obs);
      assert.equal(settled.phase, 'superseded');
      assert.match(settled.resolution!, /different message/i);
    });

    it('Row 6: Anything else: timeout / dropped session / RPC error -> unresolved', () => {
      const op = createBaseOperation('execute');
      const obsTimeout: OperationObservation = {
        rpcError: 'Timeout waiting for RPC response',
      };

      const settled = settle(op, obsTimeout);
      assert.equal(settled.phase, 'unresolved');
      assert.match(settled.resolution!, /timeout/i);
    });

    it('No observation leaves phase unresolved (cannot transition out of unresolved without observation)', () => {
      const submittedOp = createBaseOperation('approve', 'submitted');
      const unresolvedAfterNoObs = settle(submittedOp, null);
      assert.equal(unresolvedAfterNoObs.phase, 'unresolved');

      // Calling settle again with null stays unresolved
      const stillUnresolved = settle(unresolvedAfterNoObs, null);
      assert.equal(stillUnresolved.phase, 'unresolved');

      // Transitions out of unresolved when valid observation arrives
      const obsConfirmed: OperationObservation = {
        proposal: {
          multisig: MULTISIG,
          transactionIndex: 1n,
          status: { kind: 'Active' },
          approved: [MEMBER],
          rejected: [],
          cancelled: [],
          contextSlot: 10,
        },
      };
      const nowConfirmed = settle(stillUnresolved, obsConfirmed);
      assert.equal(nowConfirmed.phase, 'confirmed');
    });

    it('Terminal phases are irreversible', () => {
      const confirmedOp = createBaseOperation('approve', 'confirmed');
      const obsEmpty: OperationObservation = {};
      const settled = settle(confirmedOp, obsEmpty);
      assert.equal(settled.phase, 'confirmed');
    });
  });
});
