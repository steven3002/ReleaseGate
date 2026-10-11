import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LOADER_V3_PROGRAM_ID } from '../../src/cluster/programs';
import { LOADER_STATE_BUFFER, LOADER_STATE_PROGRAM, LOADER_STATE_PROGRAM_DATA } from '../../src/loader-v3/layout';
import { runIdentityChecks } from '../../src/verification/identity-checks';
import { runTransactionChecks } from '../../src/verification/transaction-checks';
import { runBufferChecks } from '../../src/verification/buffer-checks';
import { runDeploymentChecks } from '../../src/verification/deployment-checks';
import { runArtifactChecks } from '../../src/verification/artifact-checks';
import { runProvenanceChecks } from '../../src/verification/provenance-checks';
import { verify, type VerificationInput } from '../../src/verification/verify';
import { deriveVaultPda, deriveTransactionPda } from '../../src/squads/addresses';

describe('verification checks (Pass Mark 2)', () => {
  const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
  const MULTISIG = 'DFjKzxhsoeikC8QWW8sDPvbWynExDQaMrehYyibxVqbF';
  const VAULT = deriveVaultPda(MULTISIG, 0).address;
  const PROGRAM = '11111111111111111111111111111111';
  const VALID_COMMIT = '0123456789abcdef0123456789abcdef01234567';

  describe('identity checks', () => {
    it('cluster.genesis: pass, fail, and unknown', () => {
      const pass = runIdentityChecks({
        workspaceClusterId: 'devnet',
        workspaceMultisig: MULTISIG,
        rpcGenesisHash: DEVNET_GENESIS,
      }).find(c => c.id === 'cluster.genesis')!;
      assert.equal(pass.status, 'pass');
      assert.equal(pass.blocking, true);

      const fail = runIdentityChecks({
        workspaceClusterId: 'devnet',
        workspaceMultisig: MULTISIG,
        rpcGenesisHash: 'wrongGenesisHash1111111111111111111111111111',
      }).find(c => c.id === 'cluster.genesis')!;
      assert.equal(fail.status, 'fail');
      assert.equal(fail.expected, DEVNET_GENESIS);
      assert.equal(fail.actual, 'wrongGenesisHash1111111111111111111111111111');

      const unknown = runIdentityChecks({
        workspaceClusterId: 'devnet',
        workspaceMultisig: MULTISIG,
      }).find(c => c.id === 'cluster.genesis')!;
      assert.equal(unknown.status, 'unknown');
    });

    it('manifest.cluster: pass, fail, and unknown', () => {
      const pass = runIdentityChecks({
        workspaceClusterId: 'devnet',
        workspaceMultisig: MULTISIG,
        manifestClusterGenesisHash: DEVNET_GENESIS,
      }).find(c => c.id === 'manifest.cluster')!;
      assert.equal(pass.status, 'pass');

      const fail = runIdentityChecks({
        workspaceClusterId: 'devnet',
        workspaceMultisig: MULTISIG,
        manifestClusterGenesisHash: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
      }).find(c => c.id === 'manifest.cluster')!;
      assert.equal(fail.status, 'fail');
      assert.equal(fail.expected, DEVNET_GENESIS);

      const unknown = runIdentityChecks({
        workspaceClusterId: 'devnet',
        workspaceMultisig: MULTISIG,
      }).find(c => c.id === 'manifest.cluster')!;
      assert.equal(unknown.status, 'unknown');
    });

    it('manifest.multisig: pass, fail, and unknown', () => {
      const pass = runIdentityChecks({
        workspaceClusterId: 'devnet',
        workspaceMultisig: MULTISIG,
        manifestMultisig: MULTISIG,
      }).find(c => c.id === 'manifest.multisig')!;
      assert.equal(pass.status, 'pass');

      const fail = runIdentityChecks({
        workspaceClusterId: 'devnet',
        workspaceMultisig: MULTISIG,
        manifestMultisig: 'DifferentMultisigAddress11111111111111111111',
      }).find(c => c.id === 'manifest.multisig')!;
      assert.equal(fail.status, 'fail');
      assert.equal(fail.expected, MULTISIG);

      const unknown = runIdentityChecks({
        workspaceClusterId: 'devnet',
        workspaceMultisig: MULTISIG,
      }).find(c => c.id === 'manifest.multisig')!;
      assert.equal(unknown.status, 'unknown');
    });

    it('manifest.vault: pass, fail, and unknown', () => {
      const pass = runIdentityChecks({
        workspaceClusterId: 'devnet',
        workspaceMultisig: MULTISIG,
        manifestVault: VAULT,
        manifestVaultIndex: 0,
        storedTransactionVault: VAULT,
      }).find(c => c.id === 'manifest.vault')!;
      assert.equal(pass.status, 'pass');

      const fail = runIdentityChecks({
        workspaceClusterId: 'devnet',
        workspaceMultisig: MULTISIG,
        manifestVault: 'WrongVault1111111111111111111111111111111111',
        manifestVaultIndex: 0,
      }).find(c => c.id === 'manifest.vault')!;
      assert.equal(fail.status, 'fail');
      assert.equal(fail.expected, VAULT);

      const unknown = runIdentityChecks({
        workspaceClusterId: 'devnet',
        workspaceMultisig: MULTISIG,
      }).find(c => c.id === 'manifest.vault')!;
      assert.equal(unknown.status, 'unknown');
    });

    it('manifest.program: pass, fail, and unknown', () => {
      const pass = runIdentityChecks({
        workspaceClusterId: 'devnet',
        workspaceMultisig: MULTISIG,
        manifestProgram: PROGRAM,
        upgradeProgram: PROGRAM,
      }).find(c => c.id === 'manifest.program')!;
      assert.equal(pass.status, 'pass');

      const fail = runIdentityChecks({
        workspaceClusterId: 'devnet',
        workspaceMultisig: MULTISIG,
        manifestProgram: PROGRAM,
        upgradeProgram: 'OtherProgram11111111111111111111111111111111',
      }).find(c => c.id === 'manifest.program')!;
      assert.equal(fail.status, 'fail');

      const unknown = runIdentityChecks({
        workspaceClusterId: 'devnet',
        workspaceMultisig: MULTISIG,
        manifestProgram: PROGRAM,
      }).find(c => c.id === 'manifest.program')!;
      assert.equal(unknown.status, 'unknown');
    });
  });

  describe('transaction checks', () => {
    const txPda = deriveTransactionPda(MULTISIG, 1n).address;
    const baseTx = {
      kind: 'vault' as const,
      address: txPda,
      accounts: [],
      instructions: [],
      lookupTableCount: 0,
      messageSha256: 'abc',
      contextSlot: 100,
    };

    it('transaction.kind: pass, fail, and unknown', () => {
      const pass = runTransactionChecks({
        storedTransaction: baseTx,
        expectedMultisig: MULTISIG,
        expectedTransactionIndex: 1n,
      }).find(c => c.id === 'transaction.kind')!;
      assert.equal(pass.status, 'pass');

      const failKind = runTransactionChecks({
        storedTransaction: { ...baseTx, kind: 'config' as const },
        expectedMultisig: MULTISIG,
        expectedTransactionIndex: 1n,
      }).find(c => c.id === 'transaction.kind')!;
      assert.equal(failKind.status, 'fail');
      assert.equal(failKind.expected, 'vault');

      const failPda = runTransactionChecks({
        storedTransaction: { ...baseTx, address: 'WrongPda1111111111111111111111111111111111' },
        expectedMultisig: MULTISIG,
        expectedTransactionIndex: 1n,
      }).find(c => c.id === 'transaction.kind')!;
      assert.equal(failPda.status, 'fail');

      const unknown = runTransactionChecks({
        expectedMultisig: MULTISIG,
        expectedTransactionIndex: 1n,
      }).find(c => c.id === 'transaction.kind')!;
      assert.equal(unknown.status, 'unknown');
    });

    it('transaction.resolved: pass, fail (lookups, ephemeral signers, unused keys), and unknown', () => {
      const pass = runTransactionChecks({
        storedTransaction: baseTx,
        expectedMultisig: MULTISIG,
        expectedTransactionIndex: 1n,
      }).find(c => c.id === 'transaction.resolved')!;
      assert.equal(pass.status, 'pass');

      const failLookup = runTransactionChecks({
        storedTransaction: { ...baseTx, lookupTableCount: 1 },
        expectedMultisig: MULTISIG,
        expectedTransactionIndex: 1n,
      }).find(c => c.id === 'transaction.resolved')!;
      assert.equal(failLookup.status, 'fail');
      assert.equal(failLookup.expected, 0);
      assert.equal(failLookup.actual, 1);

      const failEphemeral = runTransactionChecks({
        storedTransaction: { ...baseTx, ephemeralSignerCount: 2 },
        expectedMultisig: MULTISIG,
        expectedTransactionIndex: 1n,
      }).find(c => c.id === 'transaction.resolved')!;
      assert.equal(failEphemeral.status, 'fail');

      const failUnused = runTransactionChecks({
        storedTransaction: baseTx,
        expectedMultisig: MULTISIG,
        expectedTransactionIndex: 1n,
        guardAssessment: { shape: 'unsupported', findings: ['Unused account key in transaction accounts: 1111'] },
      }).find(c => c.id === 'transaction.resolved')!;
      assert.equal(failUnused.status, 'fail');

      const unknown = runTransactionChecks({
        expectedMultisig: MULTISIG,
        expectedTransactionIndex: 1n,
      }).find(c => c.id === 'transaction.resolved')!;
      assert.equal(unknown.status, 'unknown');
    });

    it('transaction.supported: pass, fail, and unknown', () => {
      const canonicalIxs = [
        { kind: 'assert-buffer-owner' as const, target: 'buf', owner: LOADER_V3_PROGRAM_ID },
        { kind: 'assert-buffer-length' as const, target: 'buf', length: 137n },
        { kind: 'assert-buffer-hash' as const, target: 'buf', keccak256: 'beef', start: 37n, length: 100n },
        { kind: 'assert-deployment-slot' as const, target: 'pdata', slot: 50n },
        { kind: 'loader-upgrade' as const, programData: 'pdata', program: 'prog', buffer: 'buf', spill: 'spill', authority: VAULT },
      ];
      const pass = runTransactionChecks({
        storedTransaction: baseTx,
        expectedMultisig: MULTISIG,
        expectedTransactionIndex: 1n,
        classifiedInstructions: canonicalIxs,
      }).find(c => c.id === 'transaction.supported')!;
      assert.equal(pass.status, 'pass');

      const fail = runTransactionChecks({
        storedTransaction: baseTx,
        expectedMultisig: MULTISIG,
        expectedTransactionIndex: 1n,
        classifiedInstructions: [
          ...canonicalIxs,
          { kind: 'unsupported' as const, programId: 'bad', reason: 'unknown', dataHex: '00' },
        ],
      }).find(c => c.id === 'transaction.supported')!;
      assert.equal(fail.status, 'fail');

      const unknown = runTransactionChecks({
        storedTransaction: baseTx,
        expectedMultisig: MULTISIG,
        expectedTransactionIndex: 1n,
      }).find(c => c.id === 'transaction.supported')!;
      assert.equal(unknown.status, 'unknown');
    });

    it('guard.complete: pass, fail, and unknown', () => {
      const pass = runTransactionChecks({
        storedTransaction: baseTx,
        expectedMultisig: MULTISIG,
        expectedTransactionIndex: 1n,
        guardAssessment: { shape: 'guarded-upgrade', findings: [] },
      }).find(c => c.id === 'guard.complete')!;
      assert.equal(pass.status, 'pass');

      const fail = runTransactionChecks({
        storedTransaction: baseTx,
        expectedMultisig: MULTISIG,
        expectedTransactionIndex: 1n,
        guardAssessment: { shape: 'partial-guard', findings: [] },
      }).find(c => c.id === 'guard.complete')!;
      assert.equal(fail.status, 'fail');
      assert.equal(fail.expected, 'guarded-upgrade');
      assert.equal(fail.actual, 'partial-guard');

      const unknown = runTransactionChecks({
        storedTransaction: baseTx,
        expectedMultisig: MULTISIG,
        expectedTransactionIndex: 1n,
      }).find(c => c.id === 'guard.complete')!;
      assert.equal(unknown.status, 'unknown');
    });

    it('guard.length, guard.hash, guard.slot: pass, fail, and unknown', () => {
      const assessment = {
        shape: 'guarded-upgrade' as const,
        params: {
          program: PROGRAM,
          programData: 'pdata',
          buffer: 'buf',
          spill: 'spill',
          vault: VAULT,
          payloadLength: 1000n,
          keccak256: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
          deploymentSlot: 42n,
        },
        findings: [],
      };

      const checksPass = runTransactionChecks({
        storedTransaction: baseTx,
        expectedMultisig: MULTISIG,
        expectedTransactionIndex: 1n,
        guardAssessment: assessment,
        artifactLength: 1000,
        artifactKeccak256: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
        manifestExpectedDeploymentSlot: 42n,
      });
      assert.equal(checksPass.find(c => c.id === 'guard.length')!.status, 'pass');
      assert.equal(checksPass.find(c => c.id === 'guard.hash')!.status, 'pass');
      assert.equal(checksPass.find(c => c.id === 'guard.slot')!.status, 'pass');

      const checksFail = runTransactionChecks({
        storedTransaction: baseTx,
        expectedMultisig: MULTISIG,
        expectedTransactionIndex: 1n,
        guardAssessment: assessment,
        artifactLength: 900,
        artifactKeccak256: '0000000000000000000000000000000000000000000000000000000000000000',
        manifestExpectedDeploymentSlot: 99n,
      });
      const failLen = checksFail.find(c => c.id === 'guard.length')!;
      assert.equal(failLen.status, 'fail');
      assert.equal(failLen.expected, '937');
      assert.equal(failLen.actual, '1037');

      const failHash = checksFail.find(c => c.id === 'guard.hash')!;
      assert.equal(failHash.status, 'fail');

      const failSlot = checksFail.find(c => c.id === 'guard.slot')!;
      assert.equal(failSlot.status, 'fail');
      assert.equal(failSlot.expected, '99');
      assert.equal(failSlot.actual, '42');

      const checksUnknown = runTransactionChecks({
        storedTransaction: baseTx,
        expectedMultisig: MULTISIG,
        expectedTransactionIndex: 1n,
      });
      assert.equal(checksUnknown.find(c => c.id === 'guard.length')!.status, 'unknown');
      assert.equal(checksUnknown.find(c => c.id === 'guard.hash')!.status, 'unknown');
      assert.equal(checksUnknown.find(c => c.id === 'guard.slot')!.status, 'unknown');
    });
  });

  describe('buffer checks', () => {
    const validPayload = new Uint8Array([1, 2, 3, 4, 5]);

    it('buffer.owner: pass, fail, unknown', () => {
      const pass = runBufferChecks({
        buffer: { owner: LOADER_V3_PROGRAM_ID, stateTag: LOADER_STATE_BUFFER, authority: VAULT, payload: validPayload },
        vault: VAULT,
      }).find(c => c.id === 'buffer.owner')!;
      assert.equal(pass.status, 'pass');

      const fail = runBufferChecks({
        buffer: { owner: 'WrongOwner111111111111111111111111111111111', stateTag: LOADER_STATE_BUFFER, authority: VAULT, payload: validPayload },
      }).find(c => c.id === 'buffer.owner')!;
      assert.equal(fail.status, 'fail');

      const unknown = runBufferChecks({}).find(c => c.id === 'buffer.owner')!;
      assert.equal(unknown.status, 'unknown');
    });

    it('buffer.state: pass, fail, unknown', () => {
      const pass = runBufferChecks({
        buffer: { owner: LOADER_V3_PROGRAM_ID, stateTag: LOADER_STATE_BUFFER, authority: VAULT, payload: validPayload },
      }).find(c => c.id === 'buffer.state')!;
      assert.equal(pass.status, 'pass');

      const fail = runBufferChecks({
        buffer: { owner: LOADER_V3_PROGRAM_ID, stateTag: 0, authority: VAULT, payload: validPayload },
      }).find(c => c.id === 'buffer.state')!;
      assert.equal(fail.status, 'fail');

      const unknown = runBufferChecks({}).find(c => c.id === 'buffer.state')!;
      assert.equal(unknown.status, 'unknown');
    });

    it('buffer.authority: pass, fail, unknown', () => {
      const pass = runBufferChecks({
        buffer: { owner: LOADER_V3_PROGRAM_ID, stateTag: LOADER_STATE_BUFFER, authority: VAULT, payload: validPayload },
        vault: VAULT,
      }).find(c => c.id === 'buffer.authority')!;
      assert.equal(pass.status, 'pass');

      const fail = runBufferChecks({
        buffer: { owner: LOADER_V3_PROGRAM_ID, stateTag: LOADER_STATE_BUFFER, authority: 'WrongVault11111111111111111111111111111111', payload: validPayload },
        vault: VAULT,
      }).find(c => c.id === 'buffer.authority')!;
      assert.equal(fail.status, 'fail');
      assert.equal(fail.expected, VAULT);

      const unknown = runBufferChecks({
        buffer: { owner: LOADER_V3_PROGRAM_ID, stateTag: LOADER_STATE_BUFFER, authority: VAULT, payload: validPayload },
      }).find(c => c.id === 'buffer.authority')!;
      assert.equal(unknown.status, 'unknown');
    });

    it('buffer.length: distinguishes zero padding from non-zero trailing bytes and missing bytes', () => {
      const payload5 = new Uint8Array([1, 2, 3, 4, 5]);
      const pass = runBufferChecks({
        buffer: { owner: LOADER_V3_PROGRAM_ID, payload: payload5 },
        artifactLength: 5,
      }).find(c => c.id === 'buffer.length')!;
      assert.equal(pass.status, 'pass');

      // Extra bytes with zero padding
      const payloadZeroPadded = new Uint8Array([1, 2, 3, 4, 5, 0, 0, 0]);
      const failZeroPadding = runBufferChecks({
        buffer: { owner: LOADER_V3_PROGRAM_ID, payload: payloadZeroPadded },
        artifactLength: 5,
      }).find(c => c.id === 'buffer.length')!;
      assert.equal(failZeroPadding.status, 'fail');
      assert.equal(failZeroPadding.expected, 5);
      assert.equal(failZeroPadding.actual, 8);
      assert.match(failZeroPadding.detail!, /zero padding/i);

      // Extra bytes with non-zero trailing data
      const payloadNonZero = new Uint8Array([1, 2, 3, 4, 5, 0, 99, 0]);
      const failNonZero = runBufferChecks({
        buffer: { owner: LOADER_V3_PROGRAM_ID, payload: payloadNonZero },
        artifactLength: 5,
      }).find(c => c.id === 'buffer.length')!;
      assert.equal(failNonZero.status, 'fail');
      assert.equal(failNonZero.expected, 5);
      assert.equal(failNonZero.actual, 8);
      assert.match(failNonZero.detail!, /non-zero trailing data/i);

      // Missing bytes
      const payloadShort = new Uint8Array([1, 2, 3]);
      const failMissing = runBufferChecks({
        buffer: { owner: LOADER_V3_PROGRAM_ID, payload: payloadShort },
        artifactLength: 5,
      }).find(c => c.id === 'buffer.length')!;
      assert.equal(failMissing.status, 'fail');
      assert.equal(failMissing.expected, 5);
      assert.equal(failMissing.actual, 3);
      assert.match(failMissing.detail!, /missing 2 byte/i);

      // Unknown
      const unknown = runBufferChecks({}).find(c => c.id === 'buffer.length')!;
      assert.equal(unknown.status, 'unknown');
    });

    it('buffer.bytes: reports first differing offset, handles mismatch and unknown', () => {
      const artifact = new Uint8Array([10, 20, 30, 40, 50]);
      const exactMatch = new Uint8Array([10, 20, 30, 40, 50]);
      const pass = runBufferChecks({
        buffer: { owner: LOADER_V3_PROGRAM_ID, payload: exactMatch },
        artifactBytes: artifact,
      }).find(c => c.id === 'buffer.bytes')!;
      assert.equal(pass.status, 'pass');

      // Byte difference at index 2
      const diffAt2 = new Uint8Array([10, 20, 99, 40, 50]);
      const fail = runBufferChecks({
        buffer: { owner: LOADER_V3_PROGRAM_ID, payload: diffAt2 },
        artifactBytes: artifact,
      }).find(c => c.id === 'buffer.bytes')!;
      assert.equal(fail.status, 'fail');
      assert.match(fail.detail!, /offset 2/);
      assert.match(String(fail.expected), /1e/); // 30 is 0x1e
      assert.match(String(fail.actual), /63/); // 99 is 0x63

      const unknown = runBufferChecks({
        buffer: { owner: LOADER_V3_PROGRAM_ID, payload: exactMatch },
      }).find(c => c.id === 'buffer.bytes')!;
      assert.equal(unknown.status, 'unknown');
    });
  });

  describe('deployment checks', () => {
    const PDATA = 'Fy3YMJCvwbAXUgUM5b91ucUVA3jYzwWLHL3MwBqKsh8n';

    it('program.account: pass, fail, unknown', () => {
      const pass = runDeploymentChecks({
        programAddress: PROGRAM,
        programAccount: {
          owner: LOADER_V3_PROGRAM_ID,
          executable: true,
          programDataAddress: PDATA,
          stateTag: LOADER_STATE_PROGRAM,
        },
        expectedProgramDataAddress: PDATA,
      }).find(c => c.id === 'program.account')!;
      assert.equal(pass.status, 'pass');

      const failOwner = runDeploymentChecks({
        programAccount: { owner: 'WrongOwner', executable: true, programDataAddress: PDATA },
        expectedProgramDataAddress: PDATA,
      }).find(c => c.id === 'program.account')!;
      assert.equal(failOwner.status, 'fail');

      const failNotExec = runDeploymentChecks({
        programAccount: { owner: LOADER_V3_PROGRAM_ID, executable: false, programDataAddress: PDATA },
        expectedProgramDataAddress: PDATA,
      }).find(c => c.id === 'program.account')!;
      assert.equal(failNotExec.status, 'fail');

      const unknown = runDeploymentChecks({}).find(c => c.id === 'program.account')!;
      assert.equal(unknown.status, 'unknown');
    });

    it('programdata.state, authority, slot: pass, fail, unknown', () => {
      const pass = runDeploymentChecks({
        programDataAccount: {
          owner: LOADER_V3_PROGRAM_ID,
          stateTag: LOADER_STATE_PROGRAM_DATA,
          upgradeAuthority: VAULT,
          slot: 100n,
        },
        vault: VAULT,
        manifestExpectedDeploymentSlot: 100n,
      });
      assert.equal(pass.find(c => c.id === 'programdata.state')!.status, 'pass');
      assert.equal(pass.find(c => c.id === 'programdata.authority')!.status, 'pass');
      assert.equal(pass.find(c => c.id === 'deployment.slot')!.status, 'pass');

      const fail = runDeploymentChecks({
        programDataAccount: {
          owner: LOADER_V3_PROGRAM_ID,
          stateTag: LOADER_STATE_PROGRAM_DATA,
          upgradeAuthority: 'OtherVault',
          slot: 99n,
        },
        vault: VAULT,
        manifestExpectedDeploymentSlot: 100n,
      });
      const failAuth = fail.find(c => c.id === 'programdata.authority')!;
      assert.equal(failAuth.status, 'fail');
      assert.equal(failAuth.expected, VAULT);

      const failSlot = fail.find(c => c.id === 'deployment.slot')!;
      assert.equal(failSlot.status, 'fail');
      assert.equal(failSlot.expected, '100');
      assert.equal(failSlot.actual, '99');

      const unknown = runDeploymentChecks({});
      assert.equal(unknown.find(c => c.id === 'programdata.state')!.status, 'unknown');
      assert.equal(unknown.find(c => c.id === 'programdata.authority')!.status, 'unknown');
      assert.equal(unknown.find(c => c.id === 'deployment.slot')!.status, 'unknown');
    });

    it('programdata.capacity: notice only, non-blocking', () => {
      const pass = runDeploymentChecks({
        programDataAccount: {
          owner: LOADER_V3_PROGRAM_ID,
          capacity: 5000,
        },
        artifactLength: 4000,
      }).find(c => c.id === 'programdata.capacity')!;
      assert.equal(pass.status, 'pass');
      assert.equal(pass.blocking, false);

      const notice = runDeploymentChecks({
        programDataAccount: {
          owner: LOADER_V3_PROGRAM_ID,
          capacity: 3000,
        },
        artifactLength: 4000,
      }).find(c => c.id === 'programdata.capacity')!;
      assert.equal(notice.status, 'notice');
      assert.equal(notice.blocking, false);
      assert.match(notice.detail!, /less than artifact length/);

      const unknown = runDeploymentChecks({}).find(c => c.id === 'programdata.capacity')!;
      assert.equal(unknown.status, 'unknown');
      assert.equal(unknown.blocking, false);
    });
  });

  describe('artifact checks', () => {
    const validManifestArt = {
      length: 1234,
      sha256: 'aaaa',
      keccak256: 'bbbb',
    };
    const validReviewedArt = {
      length: 1234,
      sha256: 'aaaa',
      keccak256: 'bbbb',
    };

    it('artifact.length, sha256, keccak256: pass, fail, unknown', () => {
      const pass = runArtifactChecks({
        manifestArtifact: validManifestArt,
        reviewedArtifact: validReviewedArt,
      });
      assert.equal(pass.find(c => c.id === 'artifact.length')!.status, 'pass');
      assert.equal(pass.find(c => c.id === 'artifact.sha256')!.status, 'pass');
      assert.equal(pass.find(c => c.id === 'artifact.keccak256')!.status, 'pass');

      const fail = runArtifactChecks({
        manifestArtifact: validManifestArt,
        reviewedArtifact: {
          length: 9999,
          sha256: 'xxxx',
          keccak256: 'yyyy',
        },
      });
      const failLen = fail.find(c => c.id === 'artifact.length')!;
      assert.equal(failLen.status, 'fail');
      assert.equal(failLen.expected, 1234);
      assert.equal(failLen.actual, 9999);

      const failSha = fail.find(c => c.id === 'artifact.sha256')!;
      assert.equal(failSha.status, 'fail');
      assert.equal(failSha.expected, 'aaaa');
      assert.equal(failSha.actual, 'xxxx');

      const failKec = fail.find(c => c.id === 'artifact.keccak256')!;
      assert.equal(failKec.status, 'fail');
      assert.equal(failKec.expected, 'bbbb');
      assert.equal(failKec.actual, 'yyyy');

      const unknown = runArtifactChecks({});
      assert.equal(unknown.find(c => c.id === 'artifact.length')!.status, 'unknown');
      assert.equal(unknown.find(c => c.id === 'artifact.sha256')!.status, 'unknown');
      assert.equal(unknown.find(c => c.id === 'artifact.keccak256')!.status, 'unknown');
    });
  });

  describe('provenance checks', () => {
    const validProvenance = {
      sourceRepository: 'https://github.com/example/repo',
      commit: VALID_COMMIT,
      buildMethod: 'anchor build',
      builder: 'ci-bot',
      builtAt: '2026-10-10T00:00:00Z',
    };
    const validSource = {
      channel: 'file-picker' as const,
      size: 1234,
      importedAt: '2026-10-10T00:00:00Z',
    };
    const validAttestation = {
      statementVersion: '1',
      confirmedAt: '2026-10-10T00:00:00Z',
    };

    it('provenance.manifest, source, attestation: pass, fail, unknown', () => {
      const pass = runProvenanceChecks({
        manifestProvenance: validProvenance,
        artifactSource: validSource,
        manifestSource: validSource,
        attestation: validAttestation,
      });
      assert.equal(pass.find(c => c.id === 'provenance.manifest')!.status, 'pass');
      assert.equal(pass.find(c => c.id === 'provenance.source')!.status, 'pass');
      assert.equal(pass.find(c => c.id === 'provenance.attestation')!.status, 'pass');

      // Fail manifest provenance (invalid commit length)
      const failProv = runProvenanceChecks({
        manifestProvenance: { ...validProvenance, commit: 'short' },
        artifactSource: validSource,
        manifestSource: validSource,
        attestation: validAttestation,
      }).find(c => c.id === 'provenance.manifest')!;
      assert.equal(failProv.status, 'fail');

      // Fail provenance.source (missing manifest source)
      const failSource = runProvenanceChecks({
        manifestProvenance: validProvenance,
        artifactSource: validSource,
        attestation: validAttestation,
      }).find(c => c.id === 'provenance.source')!;
      assert.equal(failSource.status, 'fail');

      // Fail attestation (missing)
      const failAtt = runProvenanceChecks({
        manifestProvenance: validProvenance,
        artifactSource: validSource,
        manifestSource: validSource,
      }).find(c => c.id === 'provenance.attestation')!;
      assert.equal(failAtt.status, 'fail');

      // Unknown
      const unknown = runProvenanceChecks({});
      assert.equal(unknown.find(c => c.id === 'provenance.manifest')!.status, 'unknown');
      assert.equal(unknown.find(c => c.id === 'provenance.source')!.status, 'unknown');
    });
  });

  describe('verify end-to-end', () => {
    it('returns all 28 checks in canonical order', () => {
      const input: VerificationInput = {
        workspace: {
          clusterId: 'devnet',
          multisig: MULTISIG,
          rpcGenesisHash: DEVNET_GENESIS,
        },
      };
      const results = verify(input);
      assert.equal(results.length, 28);
      assert.equal(results[0]?.id, 'cluster.genesis');
      assert.equal(results[results.length - 1]?.id, 'provenance.attestation');
    });
  });
});
