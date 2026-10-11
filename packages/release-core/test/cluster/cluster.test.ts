import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getClusterDescriptor, findClusterByGenesisHash } from '../../src/cluster/clusters';
import { CANONICAL_PROGRAMS, SQUADS_PROGRAM_ID, LIGHTHOUSE_PROGRAM_ID, LOADER_V3_PROGRAM_ID } from '../../src/cluster/programs';
import { compareGenesis, matchesClusterGenesis } from '../../src/cluster/identity';

describe('cluster descriptors', () => {
  it('defines devnet with pinned genesis hash and signing enabled', () => {
    const devnet = getClusterDescriptor('devnet');
    assert.equal(devnet.genesisHash, 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
    assert.equal(devnet.walletChain, 'solana:devnet');
    assert.equal(devnet.signingEnabled, true);
  });

  it('defines mainnet-beta with pinned genesis hash and signing disabled', () => {
    const mainnet = getClusterDescriptor('mainnet-beta');
    assert.equal(mainnet.genesisHash, '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d');
    assert.equal(mainnet.walletChain, 'solana:mainnet');
    assert.equal(mainnet.signingEnabled, false);
  });

  it('finds cluster by genesis hash', () => {
    const devnet = findClusterByGenesisHash('EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
    assert.equal(devnet?.id, 'devnet');
    const unknown = findClusterByGenesisHash('unknown-hash');
    assert.equal(unknown, undefined);
  });
});

describe('canonical programs', () => {
  it('pins expected on-chain addresses', () => {
    assert.equal(CANONICAL_PROGRAMS.squads, 'SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf');
    assert.equal(CANONICAL_PROGRAMS.lighthouse, 'L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95');
    assert.equal(CANONICAL_PROGRAMS.loaderV3, 'BPFLoaderUpgradeab1e11111111111111111111111');
    assert.equal(SQUADS_PROGRAM_ID, CANONICAL_PROGRAMS.squads);
    assert.equal(LIGHTHOUSE_PROGRAM_ID, CANONICAL_PROGRAMS.lighthouse);
    assert.equal(LOADER_V3_PROGRAM_ID, CANONICAL_PROGRAMS.loaderV3);
  });
});

describe('genesis comparison', () => {
  it('accepts matching genesis hash', () => {
    const res = compareGenesis('devnet', 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
    assert.equal(res.matches, true);
    assert.equal(matchesClusterGenesis('devnet', 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'), true);
  });

  it('rejects differing genesis hash', () => {
    const res = compareGenesis('devnet', '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d');
    assert.equal(res.matches, false);
    assert.equal(matchesClusterGenesis('devnet', '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'), false);
  });
});
