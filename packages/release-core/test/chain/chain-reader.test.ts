import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Connection, PublicKey } from '@solana/web3.js';
import { Web3ChainReader } from '../../src/chain/web3-chain-reader';

describe('Web3ChainReader', () => {
  it('returns empty list for empty addresses', async () => {
    const mockConnection = {} as Connection;
    const reader = new Web3ChainReader(mockConnection);
    const res = await reader.getAccounts([]);
    assert.equal(res.contextSlot, 0);
    assert.deepEqual(res.accounts, []);
  });

  it('maps getAccounts results accurately', async () => {
    const targetAddr = '11111111111111111111111111111111';
    const ownerAddr = 'BPFLoaderUpgradeab1e11111111111111111111111';
    const mockData = Buffer.from([1, 2, 3, 4]);

    const mockConnection = {
      getGenesisHash: async () => 'mock-genesis',
      getMultipleAccountsInfoAndContext: async (keys: PublicKey[]) => {
        assert.equal(keys.length, 2);
        return {
          context: { slot: 12345 },
          value: [
            {
              data: mockData,
              owner: new PublicKey(ownerAddr),
              lamports: 5000,
              executable: false,
              rentEpoch: 42,
            },
            null,
          ],
        };
      },
    } as unknown as Connection;

    const reader = new Web3ChainReader(mockConnection);
    const hash = await reader.getGenesisHash();
    assert.equal(hash, 'mock-genesis');

    const missingAddr = '11111111111111111111111111111112';
    const res = await reader.getAccounts([targetAddr, missingAddr]);
    assert.equal(res.contextSlot, 12345);
    assert.equal(res.accounts.length, 2);

    const first = res.accounts[0];
    assert.ok(first);
    assert.equal(first.address, targetAddr);
    assert.deepEqual(first.data, new Uint8Array([1, 2, 3, 4]));
    assert.equal(first.owner, ownerAddr);
    assert.equal(first.lamports, 5000n);
    assert.equal(first.executable, false);
    assert.equal(first.rentEpoch, 42n);

    assert.equal(res.accounts[1], null);
  });

  it('maps getSignatureStatus and getTransactionOutcome', async () => {
    const mockConnection = {
      getSignatureStatus: async () => ({
        context: { slot: 100 },
        value: {
          confirmations: 1,
          err: null,
          confirmationStatus: 'confirmed' as const,
        },
      }),
      getTransaction: async () => ({
        slot: 100,
        meta: {
          err: null,
          logMessages: ['Program log: hello'],
        },
      }),
      getBlockHeight: async () => 999,
    } as unknown as Connection;

    const reader = new Web3ChainReader(mockConnection);
    assert.equal(await reader.getBlockHeight(), 999);

    const sigStatus = await reader.getSignatureStatus('sig1');
    assert.ok(sigStatus);
    assert.equal(sigStatus.slot, 100);
    assert.equal(sigStatus.confirmationStatus, 'confirmed');

    const outcome = await reader.getTransactionOutcome('sig1');
    assert.ok(outcome);
    assert.equal(outcome.slot, 100);
    assert.deepEqual(outcome.logs, ['Program log: hello']);
  });
});
