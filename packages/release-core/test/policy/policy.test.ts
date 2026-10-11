import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CLUSTERS } from '../../src/cluster/clusters';
import { evaluate, type PolicyInput } from '../../src/policy/evaluate';
import {
  createFailCheck,
  createPassCheck,
  type CheckId,
  type CheckResult,
} from '../../src/verification/check';
import { parsePermissions } from '../../src/squads/permissions';

describe('policy and verdict evaluation (Pass Marks 3 & 4)', () => {
  const DEVNET_CLUSTER = CLUSTERS.devnet;
  const SIGNING_DISABLED_CLUSTER = { ...DEVNET_CLUSTER, signingEnabled: false };
  const MEMBER = 'DFjKzxhsoeikC8QWW8sDPvbWynExDQaMrehYyibxVqbF';
  const MULTISIG_ADDRESS = 'DFjKzxhsoeikC8QWW8sDPvbWynExDQaMrehYyibxVqbF';

  const ALL_CHECK_IDS: CheckId[] = [
    'cluster.genesis',
    'manifest.cluster',
    'manifest.multisig',
    'manifest.vault',
    'manifest.program',
    'program.account',
    'transaction.kind',
    'transaction.resolved',
    'transaction.supported',
    'guard.complete',
    'guard.length',
    'guard.hash',
    'guard.slot',
    'buffer.owner',
    'buffer.state',
    'buffer.authority',
    'buffer.length',
    'buffer.bytes',
    'programdata.state',
    'programdata.authority',
    'deployment.slot',
    'programdata.capacity',
    'artifact.length',
    'artifact.sha256',
    'artifact.keccak256',
    'provenance.manifest',
    'provenance.source',
    'provenance.attestation',
  ];

  function createAllPassingChecks(): CheckResult[] {
    return ALL_CHECK_IDS.map(id => {
      let group: any = 'identity';
      if (id.startsWith('transaction.') || id.startsWith('guard.')) group = 'transaction';
      else if (id.startsWith('buffer.')) group = 'buffer';
      else if (id.startsWith('programdata.') || id === 'deployment.slot' || id === 'program.account') group = 'deployment';
      else if (id.startsWith('artifact.')) group = 'artifact';
      else if (id.startsWith('provenance.')) group = 'provenance';
      return createPassCheck(id, group);
    });
  }

  function createBaseActiveInput(): PolicyInput {
    return {
      checks: createAllPassingChecks(),
      shape: 'guarded-upgrade',
      cluster: DEVNET_CLUSTER,
      multisig: {
        address: MULTISIG_ADDRESS,
        createKey: '11111111111111111111111111111111',
        configAuthority: null,
        threshold: 2,
        timeLockSeconds: 0n,
        transactionIndex: 10n,
        staleTransactionIndex: 5n,
        members: [{ address: MEMBER, permissions: parsePermissions(7) }],
        contextSlot: 100,
      },
      proposal: {
        multisig: MULTISIG_ADDRESS,
        transactionIndex: 10n,
        status: { kind: 'Active', timestamp: 1000n },
        approved: [],
        rejected: [],
        cancelled: [],
        contextSlot: 100,
      },
      memberAddress: MEMBER,
      memberCapabilities: {
        isMember: true,
        initiate: true,
        vote: true,
        execute: true,
      },
      currentTimeSeconds: 1500,
      hasReviewedArtifact: true,
    };
  }

  describe('verdict statuses (Pass Mark 3)', () => {
    it('artifactMatch takes each value: matches, mismatch, not-evaluated', () => {
      const base = createBaseActiveInput();
      const verdictMatches = evaluate(base);
      assert.equal(verdictMatches.artifactMatch, 'matches');

      // Mismatch: buffer.bytes fails
      const failingChecks = createAllPassingChecks().map(c =>
        c.id === 'buffer.bytes' ? createFailCheck('buffer.bytes', 'buffer', 'a', 'b') : c
      );
      const verdictMismatch = evaluate({ ...base, checks: failingChecks });
      assert.equal(verdictMismatch.artifactMatch, 'mismatch');

      // Not evaluated: hasReviewedArtifact is false
      const verdictNotEval = evaluate({ ...base, hasReviewedArtifact: false });
      assert.equal(verdictNotEval.artifactMatch, 'not-evaluated');
    });

    it('executionConditions takes each value: verified, incomplete, absent, not-holding, unsupported, not-evaluated', () => {
      const base = createBaseActiveInput();

      // 1. verified: guarded-upgrade and all checks pass
      const vVerified = evaluate(base);
      assert.equal(vVerified.executionConditions, 'verified');

      // 2. incomplete: partial-guard
      const vIncomplete = evaluate({ ...base, shape: 'partial-guard' });
      assert.equal(vIncomplete.executionConditions, 'incomplete');

      // 3. absent: unguarded-upgrade
      const vAbsent = evaluate({ ...base, shape: 'unguarded-upgrade' });
      assert.equal(vAbsent.executionConditions, 'absent');

      // 4. unsupported: unsupported shape
      const vUnsupported = evaluate({ ...base, shape: 'unsupported' });
      assert.equal(vUnsupported.executionConditions, 'unsupported');

      // 5. not-evaluated: no shape
      const vNotEval = evaluate({ ...base, shape: undefined });
      assert.equal(vNotEval.executionConditions, 'not-evaluated');

      // 6. not-holding: guarded-upgrade where ONLY deployment.slot fails
      const checksSlotFail = createAllPassingChecks().map(c =>
        c.id === 'deployment.slot'
          ? createFailCheck('deployment.slot', 'deployment', '42', '100')
          : c
      );
      const vNotHolding = evaluate({ ...base, checks: checksSlotFail });
      assert.equal(vNotHolding.executionConditions, 'not-holding');

      // If deployment.slot fails AND buffer.owner fails -> must NOT be not-holding (must be unsupported)
      const checksTwoFail = checksSlotFail.map(c =>
        c.id === 'buffer.owner'
          ? createFailCheck('buffer.owner', 'buffer', 'loader', 'bad')
          : c
      );
      const vNotHoldingRejected = evaluate({ ...base, checks: checksTwoFail });
      assert.equal(vNotHoldingRejected.executionConditions, 'unsupported');
    });
  });

  describe('action decisions (Pass Mark 4)', () => {
    describe('approve', () => {
      it('fully allowed case', () => {
        const base = createBaseActiveInput();
        const v = evaluate(base);
        assert.equal(v.actions.approve.allowed, true);
        assert.deepEqual(v.actions.approve.reasons, []);
      });

      it('disallowed when cluster signing disabled', () => {
        const base = createBaseActiveInput();
        const v = evaluate({ ...base, cluster: SIGNING_DISABLED_CLUSTER });
        assert.equal(v.actions.approve.allowed, false);
        assert.match(v.actions.approve.reasons[0]!, /signing is disabled/i);
      });

      it('disallowed when member lacks Vote permission', () => {
        const base = createBaseActiveInput();
        const v = evaluate({
          ...base,
          memberCapabilities: { isMember: true, initiate: true, vote: false, execute: true },
        });
        assert.equal(v.actions.approve.allowed, false);
        assert.match(v.actions.approve.reasons.join(' '), /vote permission/i);
      });

      it('disallowed when proposal is not Active', () => {
        const base = createBaseActiveInput();
        const v = evaluate({
          ...base,
          proposal: { ...base.proposal, status: { kind: 'Approved', timestamp: 1000n } },
        });
        assert.equal(v.actions.approve.allowed, false);
        assert.match(v.actions.approve.reasons.join(' '), /must be active/i);
      });

      it('disallowed when proposal is stale', () => {
        const base = createBaseActiveInput();
        const v = evaluate({
          ...base,
          proposal: { ...base.proposal, transactionIndex: 5n },
          multisig: { ...base.multisig, staleTransactionIndex: 5n },
        });
        assert.equal(v.actions.approve.allowed, false);
        assert.match(v.actions.approve.reasons.join(' '), /stale/i);
      });

      it('disallowed when member already approved', () => {
        const base = createBaseActiveInput();
        const v = evaluate({
          ...base,
          proposal: { ...base.proposal, approved: [MEMBER] },
        });
        assert.equal(v.actions.approve.allowed, false);
        assert.match(v.actions.approve.reasons.join(' '), /already approved/i);
      });

      it('disallowed when artifact does not match', () => {
        const base = createBaseActiveInput();
        const checks = createAllPassingChecks().map(c =>
          c.id === 'buffer.bytes' ? createFailCheck('buffer.bytes', 'buffer', 'a', 'b') : c
        );
        const v = evaluate({ ...base, checks });
        assert.equal(v.actions.approve.allowed, false);
        assert.match(v.actions.approve.reasons.join(' '), /artifact match/i);
      });

      it('disallowed when execution conditions are not verified', () => {
        const base = createBaseActiveInput();
        const v = evaluate({ ...base, shape: 'unguarded-upgrade' });
        assert.equal(v.actions.approve.allowed, false);
        assert.match(v.actions.approve.reasons.join(' '), /execution conditions/i);
      });

      it('disallowed when provenance is missing', () => {
        const base = createBaseActiveInput();
        const checks = createAllPassingChecks().map(c =>
          c.id === 'provenance.attestation'
            ? createFailCheck('provenance.attestation', 'provenance', 'confirmed', 'none')
            : c
        );
        const v = evaluate({ ...base, checks });
        assert.equal(v.actions.approve.allowed, false);
        assert.match(v.actions.approve.reasons.join(' '), /provenance/i);
      });
    });

    describe('reject', () => {
      it('fully allowed case', () => {
        const base = createBaseActiveInput();
        const v = evaluate(base);
        assert.equal(v.actions.reject.allowed, true);
        assert.deepEqual(v.actions.reject.reasons, []);
      });

      it('allowed EVEN WHEN verification fails (reject does not require verification)', () => {
        const base = createBaseActiveInput();
        const allFailingChecks = createAllPassingChecks().map(c =>
          createFailCheck(c.id, c.group, 'expected', 'actual')
        );
        const v = evaluate({
          ...base,
          checks: allFailingChecks,
          shape: 'unsupported',
        });
        assert.equal(v.actions.reject.allowed, true);
      });

      it('disallowed when cluster signing disabled', () => {
        const base = createBaseActiveInput();
        const v = evaluate({ ...base, cluster: SIGNING_DISABLED_CLUSTER });
        assert.equal(v.actions.reject.allowed, false);
        assert.match(v.actions.reject.reasons[0]!, /signing is disabled/i);
      });

      it('disallowed when member lacks Vote permission', () => {
        const base = createBaseActiveInput();
        const v = evaluate({
          ...base,
          memberCapabilities: { isMember: true, initiate: true, vote: false, execute: true },
        });
        assert.equal(v.actions.reject.allowed, false);
      });

      it('disallowed when proposal is not Active', () => {
        const base = createBaseActiveInput();
        const v = evaluate({
          ...base,
          proposal: { ...base.proposal, status: { kind: 'Rejected', timestamp: 1000n } },
        });
        assert.equal(v.actions.reject.allowed, false);
      });

      it('disallowed when proposal is stale', () => {
        const base = createBaseActiveInput();
        const v = evaluate({
          ...base,
          proposal: { ...base.proposal, transactionIndex: 3n },
          multisig: { ...base.multisig, staleTransactionIndex: 4n },
        });
        assert.equal(v.actions.reject.allowed, false);
      });

      it('disallowed when member has already rejected', () => {
        const base = createBaseActiveInput();
        const v = evaluate({
          ...base,
          proposal: { ...base.proposal, rejected: [MEMBER] },
        });
        assert.equal(v.actions.reject.allowed, false);
        assert.match(v.actions.reject.reasons.join(' '), /already rejected/i);
      });
    });

    describe('execute', () => {
      function createBaseApprovedInput(): PolicyInput {
        const active = createBaseActiveInput();
        return {
          ...active,
          multisig: { ...active.multisig, timeLockSeconds: 60n },
          proposal: {
            ...active.proposal,
            status: { kind: 'Approved', timestamp: 1000n },
            approved: [MEMBER, 'AnotherMember111111111111111111111111111111'],
          },
          currentTimeSeconds: 1100, // 1000 + 60 = 1060 <= 1100 -> elapsed!
        };
      }

      it('fully allowed case', () => {
        const base = createBaseApprovedInput();
        const v = evaluate(base);
        assert.equal(v.actions.execute.allowed, true);
        assert.deepEqual(v.actions.execute.reasons, []);
      });

      it('disallowed when cluster signing disabled', () => {
        const base = createBaseApprovedInput();
        const v = evaluate({ ...base, cluster: SIGNING_DISABLED_CLUSTER });
        assert.equal(v.actions.execute.allowed, false);
      });

      it('disallowed when member lacks Execute permission', () => {
        const base = createBaseApprovedInput();
        const v = evaluate({
          ...base,
          memberCapabilities: { isMember: true, initiate: true, vote: true, execute: false },
        });
        assert.equal(v.actions.execute.allowed, false);
        assert.match(v.actions.execute.reasons.join(' '), /execute permission/i);
      });

      it('disallowed when proposal is not in Approved status', () => {
        const base = createBaseApprovedInput();
        const v = evaluate({
          ...base,
          proposal: { ...base.proposal, status: { kind: 'Active', timestamp: 1000n } },
        });
        assert.equal(v.actions.execute.allowed, false);
        assert.match(v.actions.execute.reasons.join(' '), /must be approved/i);
      });

      it('disallowed when time-lock has not elapsed', () => {
        const base = createBaseApprovedInput();
        const v = evaluate({
          ...base,
          currentTimeSeconds: 1020, // 1000 + 60 = 1060 > 1020 -> 40s remaining
        });
        assert.equal(v.actions.execute.allowed, false);
        assert.match(v.actions.execute.reasons.join(' '), /time-lock has not elapsed/i);
      });

      it('disallowed when execution conditions fail (e.g. superseded release)', () => {
        const base = createBaseApprovedInput();
        const checks = createAllPassingChecks().map(c =>
          c.id === 'deployment.slot'
            ? createFailCheck('deployment.slot', 'deployment', '42', '99')
            : c
        );
        const v = evaluate({ ...base, checks });
        assert.equal(v.actions.execute.allowed, false);
        assert.match(v.actions.execute.reasons.join(' '), /execution conditions/i);
      });
    });

    describe('createGuardedReplacement', () => {
      function createBaseUnguardedInput(): PolicyInput {
        const active = createBaseActiveInput();
        return {
          ...active,
          shape: 'unguarded-upgrade',
        };
      }

      it('fully allowed case for unguarded-upgrade', () => {
        const base = createBaseUnguardedInput();
        const v = evaluate(base);
        assert.equal(v.actions.createGuardedReplacement.allowed, true);
        assert.deepEqual(v.actions.createGuardedReplacement.reasons, []);
      });

      it('fully allowed case for partial-guard', () => {
        const base = createBaseUnguardedInput();
        const v = evaluate({ ...base, shape: 'partial-guard' });
        assert.equal(v.actions.createGuardedReplacement.allowed, true);
      });

      it('disallowed when shape is guarded-upgrade or unsupported', () => {
        const base = createBaseUnguardedInput();
        const vGuarded = evaluate({ ...base, shape: 'guarded-upgrade' });
        assert.equal(vGuarded.actions.createGuardedReplacement.allowed, false);
        assert.match(vGuarded.actions.createGuardedReplacement.reasons.join(' '), /replacement only offered/i);

        const vUnsupported = evaluate({ ...base, shape: 'unsupported' });
        assert.equal(vUnsupported.actions.createGuardedReplacement.allowed, false);
      });

      it('disallowed when cluster signing disabled', () => {
        const base = createBaseUnguardedInput();
        const v = evaluate({ ...base, cluster: SIGNING_DISABLED_CLUSTER });
        assert.equal(v.actions.createGuardedReplacement.allowed, false);
      });

      it('disallowed when member lacks Initiate permission', () => {
        const base = createBaseUnguardedInput();
        const v = evaluate({
          ...base,
          memberCapabilities: { isMember: true, initiate: false, vote: true, execute: true },
        });
        assert.equal(v.actions.createGuardedReplacement.allowed, false);
        assert.match(v.actions.createGuardedReplacement.reasons.join(' '), /initiate permission/i);
      });

      it('disallowed when artifact does not match', () => {
        const base = createBaseUnguardedInput();
        const checks = createAllPassingChecks().map(c =>
          c.id === 'buffer.length' ? createFailCheck('buffer.length', 'buffer', 100, 200) : c
        );
        const v = evaluate({ ...base, checks });
        assert.equal(v.actions.createGuardedReplacement.allowed, false);
      });

      it('disallowed when identity, buffer, or deployment check fails', () => {
        const base = createBaseUnguardedInput();
        const checks = createAllPassingChecks().map(c =>
          c.id === 'buffer.owner' ? createFailCheck('buffer.owner', 'buffer', 'loader', 'other') : c
        );
        const v = evaluate({ ...base, checks });
        assert.equal(v.actions.createGuardedReplacement.allowed, false);
        assert.match(v.actions.createGuardedReplacement.reasons.join(' '), /buffer\.owner/);
      });
    });
  });
});
