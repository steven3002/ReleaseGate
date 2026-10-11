import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import type {
  ChainReader,
  ClusterDescriptor,
  Operation,
} from 'release-core';
import {
  verifySignedTransactionMessage,
  verifyMemberSignature,
  verifyAuthorizedMember,
} from '../src/features/wallet/model/verification';
import {
  WalletDeclinedError,
  type WalletSigner,
} from '../src/features/wallet/types';
import { executeOperationPipeline } from '../src/features/recovery/model/pipeline';
import type { OperationJournal } from '../src/features/recovery/model/types';

const DEVNET_CLUSTER: ClusterDescriptor = {
  id: 'devnet',
  name: 'Devnet',
  genesisHash: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
  defaultRpcUrl: 'https://api.devnet.solana.com',
  walletChain: 'solana:devnet',
  signingEnabled: true,
};

class InMemoryJournal implements OperationJournal {
  private ops = new Map<string, Operation>();

  async saveOperation(operation: Operation): Promise<void> {
    this.ops.set(operation.id, { ...operation });
  }

  async getOperation(id: string): Promise<Operation | null> {
    const op = this.ops.get(id);
    return op ? { ...op } : null;
  }

  async listOperations(): Promise<Operation[]> {
    return Array.from(this.ops.values());
  }

  async removeOperation(id: string): Promise<void> {
    this.ops.delete(id);
  }
}

describe('Wallet transaction & message verification (Pass Mark 11)', () => {
  it('refuses transaction when returned message differs from built one', () => {
    const memberKeypair = Keypair.generate();

    const builtTx = new Transaction();
    builtTx.recentBlockhash = '11111111111111111111111111111111';
    builtTx.feePayer = memberKeypair.publicKey;
    builtTx.add(
      new TransactionInstruction({
        programId: new PublicKey('11111111111111111111111111111111'),
        keys: [{ pubkey: memberKeypair.publicKey, isSigner: true, isWritable: true }],
        data: Buffer.from([1, 2, 3]),
      })
    );

    // Tampered transaction
    const tamperedTx = new Transaction();
    tamperedTx.recentBlockhash = builtTx.recentBlockhash;
    tamperedTx.feePayer = builtTx.feePayer;
    tamperedTx.add(
      new TransactionInstruction({
        programId: new PublicKey('11111111111111111111111111111111'),
        keys: [{ pubkey: memberKeypair.publicKey, isSigner: true, isWritable: true }],
        data: Buffer.from([9, 9, 9]), // altered data!
      })
    );
    tamperedTx.sign(memberKeypair);

    assert.throws(
      () => {
        verifySignedTransactionMessage(builtTx, tamperedTx);
      },
      (err: Error) => {
        assert.match(err.message, /Wallet altered transaction message bytes; signature refused/);
        return true;
      }
    );
  });

  it('accepts transaction when returned message is byte-identical', () => {
    const memberKeypair = Keypair.generate();

    const builtTx = new Transaction();
    builtTx.recentBlockhash = '11111111111111111111111111111111';
    builtTx.feePayer = memberKeypair.publicKey;
    builtTx.add(
      new TransactionInstruction({
        programId: new PublicKey('11111111111111111111111111111111'),
        keys: [{ pubkey: memberKeypair.publicKey, isSigner: true, isWritable: true }],
        data: Buffer.from([1, 2, 3]),
      })
    );

    const signedTx = new Transaction();
    signedTx.recentBlockhash = builtTx.recentBlockhash;
    signedTx.feePayer = builtTx.feePayer;
    signedTx.add(
      new TransactionInstruction({
        programId: new PublicKey('11111111111111111111111111111111'),
        keys: [{ pubkey: memberKeypair.publicKey, isSigner: true, isWritable: true }],
        data: Buffer.from([1, 2, 3]),
      })
    );
    signedTx.sign(memberKeypair);

    assert.doesNotThrow(() => {
      verifySignedTransactionMessage(builtTx, signedTx);
      verifyMemberSignature(signedTx, memberKeypair.publicKey.toBase58());
    });
  });

  it('enforces that authorized account matches workspace member', () => {
    const requestedMember = Keypair.generate().publicKey.toBase58();
    const differentMember = Keypair.generate().publicKey.toBase58();

    assert.throws(
      () => {
        verifyAuthorizedMember(differentMember, requestedMember);
      },
      (err: Error) => {
        assert.match(err.message, /Connected account .* is not the selected member/);
        return true;
      }
    );

    assert.doesNotThrow(() => {
      verifyAuthorizedMember(requestedMember, requestedMember);
    });
  });
});

describe('Recovery operation pipeline (Pass Mark 10)', () => {
  it('guarantees journal entry is written before wallet opens', async () => {
    const member = Keypair.generate().publicKey.toBase58();
    const opId = `test-op-${Date.now()}`;
    const initialOp: Operation = {
      id: opId,
      kind: 'approve',
      clusterId: 'devnet',
      multisig: 'HfR4S98sUkf5VNkm64zQV8eAemmpMnS9DcCcWNz51uaR',
      transactionIndex: 1n,
      member,
      phase: 'prepared',
      submission: 'app-rpc',
      blockhash: '11111111111111111111111111111111',
      lastValidBlockHeight: 1000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const journal = new InMemoryJournal();
    const phaseSequence: string[] = [];

    const stubSigner: WalletSigner = {
      connect: async () => ({ member, authToken: 'tok' }),
      disconnect: async () => {},
      getCachedMember: async () => member,
      signAndSubmit: async () => {
        // When wallet is open, verify that the operation is ALREADY written in the journal!
        const journalOp = await journal.getOperation(opId);
        assert.ok(journalOp, 'Operation must already exist in journal before wallet executes');
        assert.equal(
          journalOp.phase,
          'handed-off',
          'Operation must be in handed-off phase when wallet is active'
        );
        phaseSequence.push('wallet-opened');
        return {
          submissionMethod: 'app-rpc',
          signature: 'sig-12345',
        };
      },
    };

    const stubChainReader: ChainReader = {
      getGenesisHash: async () => 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
      getBlockHeight: async () => 500,
      getSignatureStatus: async () => ({ err: null }),
      getTransactionOutcome: async () => null,
      getAccounts: async () => ({
        contextSlot: 100,
        accounts: [null, null],
      }),
    };

    const stubConnection: any = {
      sendRawTransaction: async () => 'sig-12345',
    };

    const tx = new Transaction();
    tx.recentBlockhash = '11111111111111111111111111111111';

    const result = await executeOperationPipeline({
      operation: initialOp,
      transaction: tx,
      cluster: DEVNET_CLUSTER,
      connection: stubConnection,
      chainReader: stubChainReader,
      walletSigner: stubSigner,
      journal,
      pollTimeoutMs: 50,
      pollIntervalMs: 10,
      onPhaseChange: (op) => {
        phaseSequence.push(`phase:${op.phase}`);
      },
    });

    assert.ok(phaseSequence.includes('wallet-opened'));
    const walletIdx = phaseSequence.indexOf('wallet-opened');
    const handedOffIdx = phaseSequence.indexOf('phase:handed-off');
    assert.ok(handedOffIdx < walletIdx, 'handed-off phase must precede wallet opening');
    const preparedIdx = phaseSequence.indexOf('phase:prepared');
    assert.ok(preparedIdx < handedOffIdx, 'prepared phase must precede handed-off phase');
  });

  it('transitions to declined phase when user declines in wallet', async () => {
    const member = Keypair.generate().publicKey.toBase58();
    const opId = `test-op-decline-${Date.now()}`;
    const initialOp: Operation = {
      id: opId,
      kind: 'approve',
      clusterId: 'devnet',
      multisig: 'HfR4S98sUkf5VNkm64zQV8eAemmpMnS9DcCcWNz51uaR',
      transactionIndex: 1n,
      member,
      phase: 'prepared',
      submission: 'app-rpc',
      blockhash: '11111111111111111111111111111111',
      lastValidBlockHeight: 1000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const journal = new InMemoryJournal();

    const stubSigner: WalletSigner = {
      connect: async () => ({ member, authToken: 'tok' }),
      disconnect: async () => {},
      getCachedMember: async () => member,
      signAndSubmit: async () => {
        throw new WalletDeclinedError();
      },
    };

    const stubChainReader: any = {};
    const stubConnection: any = {};
    const tx = new Transaction();

    const result = await executeOperationPipeline({
      operation: initialOp,
      transaction: tx,
      cluster: DEVNET_CLUSTER,
      connection: stubConnection,
      chainReader: stubChainReader,
      walletSigner: stubSigner,
      journal,
    });

    assert.equal(result.operation.phase, 'declined');
    const stored = await journal.getOperation(opId);
    assert.equal(stored?.phase, 'declined');
  });
});
