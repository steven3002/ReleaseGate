import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import type { Instruction } from 'release-core';

export interface SubmitOptions {
  readonly skipPreflight?: boolean | undefined;
  readonly maxRetries?: number | undefined;
  readonly computeUnitLimit?: number | undefined;
  readonly computeUnitPrice?: number | undefined;
}

export interface SubmissionResult {
  readonly signature: string;
  readonly slot: number;
  readonly err: unknown | null;
  readonly logs: readonly string[];
  readonly success: boolean;
  readonly serializedTxSize: number;
}

export function toTransactionInstruction(ix: Instruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((acc) => ({
      pubkey: new PublicKey(acc.address),
      isSigner: acc.isSigner,
      isWritable: acc.isWritable,
    })),
    data: Buffer.from(ix.data),
  });
}

export async function submitInstructions(
  connection: Connection,
  instructions: readonly Instruction[],
  payer: Keypair,
  additionalSigners: readonly Keypair[] = [],
  options: SubmitOptions = {},
): Promise<SubmissionResult> {
  const tx = new Transaction();

  if (options.computeUnitLimit !== undefined) {
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: options.computeUnitLimit }));
  }
  if (options.computeUnitPrice !== undefined) {
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: options.computeUnitPrice }));
  }

  for (const ix of instructions) {
    tx.add(toTransactionInstruction(ix));
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;

  const signers = [payer, ...additionalSigners];
  tx.sign(...signers);

  const rawTx = tx.serialize();
  let signature: string;

  const sendOptions: { skipPreflight?: boolean; maxRetries?: number } = {
    skipPreflight: options.skipPreflight ?? false,
  };
  if (options.maxRetries !== undefined) {
    sendOptions.maxRetries = options.maxRetries;
  }

  try {
    signature = await connection.sendRawTransaction(rawTx, sendOptions);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to send transaction: ${message}`);
  }

  try {
    await connection.confirmTransaction(
      {
        signature,
        blockhash,
        lastValidBlockHeight,
      },
      'confirmed',
    );
  } catch {
    // Confirmation error may happen if transaction failed on chain; retrieve outcome below
  }

  const txDetails = await connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });

  const slot = txDetails?.slot ?? 0;
  const metaErr = txDetails?.meta?.err ?? null;
  const logs = txDetails?.meta?.logMessages ?? [];
  const success = metaErr === null;

  return {
    signature,
    slot,
    err: metaErr,
    logs,
    success,
    serializedTxSize: rawTx.length,
  };
}
