import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'buffer';
import { CLUSTERS } from '../../src/cluster/clusters';
import { LOADER_V3_PROGRAM_ID } from '../../src/cluster/programs';
import { LOADER_STATE_BUFFER, LOADER_STATE_PROGRAM, LOADER_STATE_PROGRAM_DATA } from '../../src/loader-v3/layout';
import { decodeStoredTransaction } from '../../src/squads/stored-transaction';
import { decodeProposalAccount } from '../../src/squads/proposal';
import { decodeMultisigAccount } from '../../src/squads/multisig';
import {
  deriveMultisigPda,
  deriveTransactionPda,
  deriveVaultPda,
} from '../../src/squads/addresses';
import { assessStoredTransaction } from '../../src/guard/assess';
import { classifyInstructions } from '../../src/inspection/classify';
import { verify, type VerificationInput } from '../../src/verification/verify';
import { evaluate } from '../../src/policy/evaluate';
import devnetFixture from '../fixtures/local-svm-lifecycle.devnet-squads-build.json';
import mainnetFixture from '../fixtures/local-svm-lifecycle.mainnet-squads-build.json';

describe('scenario from golden fixtures: both builds (Pass Mark 5)', () => {
  const builds = [
    { name: 'devnet build', fixture: devnetFixture },
    { name: 'mainnet build', fixture: mainnetFixture },
  ];

  for (const { name, fixture } of builds) {
    describe(`Lifecycle scenario: ${name}`, () => {
      const snapBefore = fixture.snapshots['all-approved-before-any-execution'];
      const snapAfter = fixture.snapshots['after-newer-release-executed'];

      const multisigDec = decodeMultisigAccount(
        new Uint8Array(Buffer.from(snapBefore.multisig.data_base64, 'base64'))
      );
      if (!multisigDec.ok) throw new Error('Failed to decode multisig');

      const multisigAddress = deriveMultisigPda(multisigDec.value.createKey).address;
      const vault = deriveVaultPda(multisigAddress, 0).address;

      const multisigSnapshot = {
        address: multisigAddress,
        createKey: multisigDec.value.createKey,
        configAuthority: multisigDec.value.configAuthority,
        threshold: multisigDec.value.threshold,
        timeLockSeconds: multisigDec.value.timeLockSeconds,
        transactionIndex: multisigDec.value.transactionIndex,
        staleTransactionIndex: multisigDec.value.staleTransactionIndex,
        members: multisigDec.value.members,
        contextSlot: 100,
      };

      // Synthetic artifact matching the fixture artifact length and hashes
      const artifactLength = fixture.artifact.length;
      const artifactKeccak256 = fixture.artifact.keccak256;
      const artifactSha256 = snapBefore.buffer_a.payload_sha256;

      // A mock artifact byte array of matching length
      const mockArtifactBytes = new Uint8Array(artifactLength);
      mockArtifactBytes[0] = 0x7f;
      mockArtifactBytes[1] = 0x45;
      mockArtifactBytes[2] = 0x4c;
      mockArtifactBytes[3] = 0x46;

      const bufferAPayload = new Uint8Array(mockArtifactBytes);
      const bufferBPayload = new Uint8Array(mockArtifactBytes);

      function createRelease(program: string, expectedSlot: bigint) {
        return {
          id: artifactSha256,
          manifest: {
            schema: 'releasegate.manifest/1' as const,
            release: { name: 'test', version: '1' },
            cluster: { name: 'devnet', genesisHash: CLUSTERS.devnet.genesisHash },
            multisig: multisigAddress,
            vaultIndex: 0,
            vault,
            program,
            expectedDeploymentSlot: expectedSlot,
            artifact: {
              fileName: 'program.so',
              length: artifactLength,
              sha256: artifactSha256,
              keccak256: artifactKeccak256,
            },
            provenance: {
              sourceRepository: 'https://github.com/example/repo',
              commit: '0123456789abcdef0123456789abcdef01234567',
              buildMethod: 'anchor build',
              builder: 'alice',
              builtAt: '2026-10-10T00:00:00Z',
            },
          },
          manifestSha256: 'manifest_sha256',
          artifact: {
            sha256: artifactSha256,
            keccak256: artifactKeccak256,
            length: artifactLength,
            bytes: mockArtifactBytes,
          },
          artifactSource: { channel: 'file-picker' as const, size: artifactLength, importedAt: '2026-10-10T00:00:00Z' },
          manifestSource: { channel: 'file-picker' as const, size: 500, importedAt: '2026-10-10T00:00:00Z' },
          attestation: { statementVersion: '1', confirmedAt: '2026-10-10T00:00:00Z' },
        };
      }

      function buildVerificationInput(
        propIndex: '1' | '2' | '3',
        snapshot: any,
        expectedSlot: bigint,
        customBufferPayload?: Uint8Array
      ): VerificationInput {
        const propRaw = snapshot.proposals[propIndex];
        const txRaw = snapshot.transactions[propIndex];

        const propDec = decodeProposalAccount(
          new Uint8Array(Buffer.from(propRaw.data_base64, 'base64'))
        );
        if (!propDec.ok) throw new Error(`Proposal ${propIndex} decode failed`);

        const txAddress = deriveTransactionPda(multisigAddress, BigInt(propIndex)).address;
        const txBytes = new Uint8Array(Buffer.from(txRaw.data_base64, 'base64'));
        const txDec = decodeStoredTransaction(txAddress, txBytes, 100);
        if (!txDec.ok) throw new Error(`Tx ${propIndex} decode failed`);

        const storedTx = txDec.value;
        const guardAssessment = assessStoredTransaction(storedTx);
        const classifiedInstructions = classifyInstructions(storedTx.instructions);

        const payload = customBufferPayload ?? (propIndex === '3' ? bufferBPayload : bufferAPayload);
        const programAddress = guardAssessment.params?.program ?? fixture.constants.loader;

        const chainEvidence = {
          program: {
            owner: LOADER_V3_PROGRAM_ID,
            executable: true,
            programDataAddress: guardAssessment.params?.programData ?? '',
            stateTag: LOADER_STATE_PROGRAM,
          },
          programData: {
            owner: LOADER_V3_PROGRAM_ID,
            slot: propIndex === '1' && snapshot === snapAfter ? 100n : 0n,
            upgradeAuthority: vault,
            capacity: artifactLength + 100,
            stateTag: LOADER_STATE_PROGRAM_DATA,
          },
          buffer: {
            owner: LOADER_V3_PROGRAM_ID,
            stateTag: LOADER_STATE_BUFFER,
            authority: vault,
            payload,
          },
          contextSlot: 100,
        };

        const release = createRelease(programAddress, expectedSlot);

        return {
          workspace: {
            clusterId: 'devnet',
            multisig: multisigAddress,
            rpcGenesisHash: CLUSTERS.devnet.genesisHash,
          },
          multisig: multisigSnapshot,
          proposal: {
            multisig: multisigAddress,
            transactionIndex: BigInt(propIndex),
            status: propDec.value.status,
            approved: propDec.value.approved,
            rejected: propDec.value.rejected,
            cancelled: propDec.value.cancelled,
            contextSlot: 100,
          },
          storedTransaction: storedTx,
          guardAssessment,
          classifiedInstructions,
          chainEvidence,
          release,
        };
      }

      it('Before any execution: proposals 1 and 3 give "matches" and "verified"; proposal 2 gives "incomplete"', () => {
        // Proposal 1
        const input1 = buildVerificationInput('1', snapBefore, 0n);
        const checks1 = verify(input1);
        const verdict1 = evaluate({
          checks: checks1,
          shape: input1.guardAssessment?.shape,
          cluster: CLUSTERS.devnet,
          multisig: multisigSnapshot,
          proposal: input1.proposal!,
          memberAddress: multisigSnapshot.members[0]?.address,
          memberCapabilities: { isMember: true, initiate: true, vote: true, execute: true },
          currentTimeSeconds: 1500,
          hasReviewedArtifact: true,
        });

        assert.equal(verdict1.artifactMatch, 'matches');
        assert.equal(verdict1.executionConditions, 'verified');

        // Proposal 3
        const input3 = buildVerificationInput('3', snapBefore, 0n);
        const checks3 = verify(input3);
        const verdict3 = evaluate({
          checks: checks3,
          shape: input3.guardAssessment?.shape,
          cluster: CLUSTERS.devnet,
          multisig: multisigSnapshot,
          proposal: input3.proposal!,
          memberAddress: multisigSnapshot.members[0]?.address,
          memberCapabilities: { isMember: true, initiate: true, vote: true, execute: true },
          currentTimeSeconds: 1500,
          hasReviewedArtifact: true,
        });

        assert.equal(verdict3.artifactMatch, 'matches');
        assert.equal(verdict3.executionConditions, 'verified');

        // Proposal 2 (partial-guard)
        const input2 = buildVerificationInput('2', snapBefore, 0n);
        const checks2 = verify(input2);
        const verdict2 = evaluate({
          checks: checks2,
          shape: input2.guardAssessment?.shape,
          cluster: CLUSTERS.devnet,
          multisig: multisigSnapshot,
          proposal: input2.proposal!,
          memberAddress: multisigSnapshot.members[0]?.address,
          memberCapabilities: { isMember: true, initiate: true, vote: true, execute: true },
          currentTimeSeconds: 1500,
          hasReviewedArtifact: true,
        });

        assert.equal(verdict2.executionConditions, 'incomplete');
      });

      it('After newer release executed: proposal 1 gives "not-holding" and execute is disallowed', () => {
        // In snapAfter, ProgramData slot is 100, but Proposal 1 was reviewed against slot 0
        const input1After = buildVerificationInput('1', snapAfter, 0n);
        const checks1After = verify(input1After);
        const verdict1After = evaluate({
          checks: checks1After,
          shape: input1After.guardAssessment?.shape,
          cluster: CLUSTERS.devnet,
          multisig: multisigSnapshot,
          proposal: input1After.proposal!,
          memberAddress: multisigSnapshot.members[0]?.address,
          memberCapabilities: { isMember: true, initiate: true, vote: true, execute: true },
          currentTimeSeconds: 1500,
          hasReviewedArtifact: true,
        });

        assert.equal(verdict1After.executionConditions, 'not-holding');
        assert.equal(verdict1After.actions.execute.allowed, false);
        assert.match(verdict1After.actions.execute.reasons.join(' '), /execution conditions/i);
      });

      it('A one-byte change in the buffer payload gives "mismatch"', () => {
        const corruptedBufferPayload = new Uint8Array(mockArtifactBytes);
        corruptedBufferPayload[10] = (corruptedBufferPayload[10] ?? 0) ^ 0xff; // One-byte mutation!

        const inputCorrupted = buildVerificationInput('1', snapBefore, 0n, corruptedBufferPayload);
        const checksCorrupted = verify(inputCorrupted);
        const verdictCorrupted = evaluate({
          checks: checksCorrupted,
          shape: inputCorrupted.guardAssessment?.shape,
          cluster: CLUSTERS.devnet,
          multisig: multisigSnapshot,
          proposal: inputCorrupted.proposal!,
          memberAddress: multisigSnapshot.members[0]?.address,
          memberCapabilities: { isMember: true, initiate: true, vote: true, execute: true },
          currentTimeSeconds: 1500,
          hasReviewedArtifact: true,
        });

        assert.equal(verdictCorrupted.artifactMatch, 'mismatch');
      });
    });
  }
});
