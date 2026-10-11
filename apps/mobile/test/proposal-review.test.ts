import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STANDING_NOTE,
  getArtifactMatchWording,
  getExecutionConditionsWording,
  getProvenanceWording,
  DIGEST_LABELS,
} from '../src/features/proposal-review/model/wording';
import {
  filterCandidateReleases,
  resolveDefaultReleaseSelection,
} from '../src/features/proposal-review/model/release-selector';
import type { ImportedRelease } from '../src/features/release-import/types';

describe('proposal-review feature unit tests', () => {
  const dummyRelease: ImportedRelease = {
    id: 'test-release-id-1',
    manifest: {
      schema: 'releasegate.manifest/1',
      cluster: {
        name: 'devnet',
        genesisHash: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
      },
      multisig: 'HfR4S98sUkf5VNkm64zQV8eAemmpMnS9DcCcWNz51uaR',
      vaultIndex: 0,
      vault: 'BmYcaND7hRez4HaFU48VQmdnf15rSZzCfpu813Ddbbro',
      program: 'DfYQBwP93gy5VTRZDqXjL36MAHRYz8po9kekxmSkaC6S',
      expectedDeploymentSlot: 509879837n,
      artifact: {
        length: 3056,
        sha256: 'fbf510dc' + '0'.repeat(56),
        keccak256: 'a1b2c3d4' + '0'.repeat(56),
      },
      provenance: {
        sourceRepository: 'https://github.com/example/repo',
        commit: '1234567890123456789012345678901234567890',
        buildMethod: 'cargo-build-sbf',
        builder: 'ci-runner',
      },
    },
    manifestSha256: 'manifest-sha-256',
    artifact: {
      sha256: 'fbf510dc' + '0'.repeat(56),
      keccak256: 'a1b2c3d4' + '0'.repeat(56),
      length: 3056,
      storageRef: 'ref',
    },
    artifactSource: {
      channel: 'file-picker',
      importedAt: '2026-10-11T00:00:00Z',
    },
    manifestSource: {
      channel: 'file-picker',
      importedAt: '2026-10-11T00:00:00Z',
    },
  };

  it('wording table matches exact project specification text', () => {
    assert.equal(getArtifactMatchWording('matches'), 'Matches reviewed artifact');
    assert.equal(getArtifactMatchWording('mismatch'), 'Does not match reviewed artifact');
    assert.equal(getArtifactMatchWording('not-evaluated'), 'No reviewed artifact selected');

    assert.equal(getExecutionConditionsWording('verified'), 'Execution conditions verified');
    assert.equal(getExecutionConditionsWording('incomplete'), 'Execution conditions incomplete');
    assert.equal(getExecutionConditionsWording('absent'), 'Execution conditions missing');
    assert.equal(getExecutionConditionsWording('not-holding'), 'Execution conditions no longer hold');
    assert.equal(getExecutionConditionsWording('unsupported'), 'Unsupported transaction');

    assert.equal(getProvenanceWording('recorded'), 'provenance: recorded');
    assert.equal(getProvenanceWording('missing'), 'provenance: missing');

    assert.equal(
      STANDING_NOTE,
      'A matching hash shows these are the reviewed bytes. It does not show that the code is harmless or audited.'
    );
  });

  it('Pass Mark 11: None of the words safe, secure, audited appears in any verdict text', () => {
    const verdictTexts = [
      getArtifactMatchWording('matches'),
      getArtifactMatchWording('mismatch'),
      getArtifactMatchWording('not-evaluated'),
      getExecutionConditionsWording('verified'),
      getExecutionConditionsWording('incomplete'),
      getExecutionConditionsWording('absent'),
      getExecutionConditionsWording('not-holding'),
      getExecutionConditionsWording('unsupported'),
      getProvenanceWording('recorded'),
      getProvenanceWording('missing'),
    ];

    for (const text of verdictTexts) {
      assert.doesNotMatch(text, /\bsafe\b/i, `Verdict text "${text}" contains "safe"`);
      assert.doesNotMatch(text, /\bsecure\b/i, `Verdict text "${text}" contains "secure"`);
      assert.doesNotMatch(text, /\baudited\b/i, `Verdict text "${text}" contains "audited"`);
    }
  });

  it('digests are explicitly labelled by convention', () => {
    assert.equal(DIGEST_LABELS.sha256, 'literal SHA-256');
    assert.equal(DIGEST_LABELS.keccak256, 'literal Keccak-256');
    assert.equal(DIGEST_LABELS.verifiedBuildSha256, 'verified-build SHA-256');
  });

  it('filterCandidateReleases matches cluster, multisig, and program', () => {
    const matching = filterCandidateReleases(
      [dummyRelease],
      'devnet',
      'HfR4S98sUkf5VNkm64zQV8eAemmpMnS9DcCcWNz51uaR',
      'DfYQBwP93gy5VTRZDqXjL36MAHRYz8po9kekxmSkaC6S'
    );
    assert.equal(matching.length, 1);

    // Mismatched program
    const wrongProg = filterCandidateReleases(
      [dummyRelease],
      'devnet',
      'HfR4S98sUkf5VNkm64zQV8eAemmpMnS9DcCcWNz51uaR',
      'WrongProgram111111111111111111111111111111111'
    );
    assert.equal(wrongProg.length, 0);

    // Mismatched multisig
    const wrongMs = filterCandidateReleases(
      [dummyRelease],
      'devnet',
      'WrongMultisig11111111111111111111111111111111'
    );
    assert.equal(wrongMs.length, 0);

    // Mismatched cluster
    const wrongCluster = filterCandidateReleases(
      [dummyRelease],
      'mainnet-beta',
      'HfR4S98sUkf5VNkm64zQV8eAemmpMnS9DcCcWNz51uaR'
    );
    assert.equal(wrongCluster.length, 0);
  });

  it('resolveDefaultReleaseSelection selects candidate if single, null otherwise', () => {
    assert.equal(resolveDefaultReleaseSelection([dummyRelease]), 'test-release-id-1');
    assert.equal(resolveDefaultReleaseSelection([]), null);
    assert.equal(
      resolveDefaultReleaseSelection([dummyRelease, { ...dummyRelease, id: 'test-2' }]),
      null
    );
  });
});
