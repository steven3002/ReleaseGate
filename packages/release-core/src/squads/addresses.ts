import { PublicKey } from '@solana/web3.js';
import * as sq from '@sqds/multisig';

export interface PdaResult {
  readonly address: string;
  readonly bump: number;
}

/**
 * Derives the canonical Multisig PDA from the create key.
 */
export function deriveMultisigPda(createKey: string): PdaResult {
  const [pda, bump] = sq.getMultisigPda({ createKey: new PublicKey(createKey) });
  return { address: pda.toBase58(), bump };
}

/**
 * Derives the canonical Vault PDA for a given multisig and vault index.
 */
export function deriveVaultPda(multisig: string, vaultIndex = 0): PdaResult {
  const [pda, bump] = sq.getVaultPda({
    multisigPda: new PublicKey(multisig),
    index: vaultIndex,
  });
  return { address: pda.toBase58(), bump };
}

/**
 * Derives the canonical Transaction PDA for a given multisig and transaction index.
 */
export function deriveTransactionPda(multisig: string, index: bigint): PdaResult {
  const [pda, bump] = sq.getTransactionPda({
    multisigPda: new PublicKey(multisig),
    index,
  });
  return { address: pda.toBase58(), bump };
}

/**
 * Derives the canonical Proposal PDA for a given multisig and transaction index.
 */
export function deriveProposalPda(multisig: string, transactionIndex: bigint): PdaResult {
  const [pda, bump] = sq.getProposalPda({
    multisigPda: new PublicKey(multisig),
    transactionIndex,
  });
  return { address: pda.toBase58(), bump };
}
