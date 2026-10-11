import { Buffer } from 'buffer';
import * as sq from '@sqds/multisig';
import type { AccountMeta, Instruction } from '../chain/instruction';
import { encodeHex } from '../digest/hex';
import { sha256 } from '../digest/sha256';
import { deriveVaultPda } from './addresses';

export type StoredTransactionKind = 'vault' | 'config' | 'batch' | 'unknown';

export interface StoredTransaction {
  readonly kind: StoredTransactionKind;
  readonly address: string;
  readonly creator?: string | undefined;
  readonly vaultIndex?: number | undefined;
  readonly vault?: string | undefined;
  readonly ephemeralSignerCount?: number | undefined;
  readonly accounts: readonly AccountMeta[];
  readonly instructions: readonly Instruction[];
  readonly lookupTableCount: number;
  readonly messageSha256: string;
  readonly contextSlot: number;
}

export type StoredTransactionDecoding =
  | { readonly ok: true; readonly value: StoredTransaction }
  | { readonly ok: false; readonly reason: string };

export const DISCRIMINATOR_VAULT_TRANSACTION = 'a8faa264510ea2cf';
export const DISCRIMINATOR_CONFIG_TRANSACTION = '5e080423718b8b70';
export const DISCRIMINATOR_BATCH = '9cc2462c1658892c';
export const DISCRIMINATOR_VAULT_BATCH = 'c4792e240c13fc07';

export function identifyTransactionKind(data: Uint8Array): StoredTransactionKind {
  if (data.length < 8) {
    return 'unknown';
  }
  const disc = encodeHex(data.subarray(0, 8));
  if (disc === DISCRIMINATOR_VAULT_TRANSACTION) {
    return 'vault';
  }
  if (disc === DISCRIMINATOR_CONFIG_TRANSACTION) {
    return 'config';
  }
  if (disc === DISCRIMINATOR_BATCH || disc === DISCRIMINATOR_VAULT_BATCH) {
    return 'batch';
  }
  return 'unknown';
}

/**
 * Decodes a stored transaction account into a typed StoredTransaction model.
 * Non-vault transactions are classified by kind and returned safely without failing.
 */
export function decodeStoredTransaction(
  address: string,
  data: Uint8Array,
  contextSlot: number
): StoredTransactionDecoding {
  const kind = identifyTransactionKind(data);
  if (kind !== 'vault') {
    return {
      ok: true,
      value: {
        kind,
        address,
        accounts: [],
        instructions: [],
        lookupTableCount: 0,
        messageSha256: data.length >= 8 ? sha256(data) : '',
        contextSlot,
      },
    };
  }

  try {
    const [tx] = sq.accounts.VaultTransaction.deserialize(Buffer.from(data));
    const multisigAddress = tx.multisig.toBase58();
    const vaultIndex = tx.vaultIndex;
    const vault = deriveVaultPda(multisigAddress, vaultIndex).address;
    const creator = tx.creator.toBase58();
    const ephemeralSignerCount = tx.ephemeralSignerBumps.length;

    const messageOffset = 8 + 32 + 32 + 8 + 1 + 1 + 1 + 4 + tx.ephemeralSignerBumps.length;
    const messageSha256 = sha256(data.subarray(messageOffset));

    const accountKeys = tx.message.accountKeys.map(k => k.toBase58());
    const accounts: AccountMeta[] = accountKeys.map((addr, idx) => ({
      address: addr,
      isSigner: sq.utils.isSignerIndex(tx.message, idx),
      isWritable: sq.utils.isStaticWritableIndex(tx.message, idx),
    }));

    const instructions: Instruction[] = tx.message.instructions.map(compiled => {
      const programId = accountKeys[compiled.programIdIndex] ?? '';
      const ixAccounts: AccountMeta[] = Array.from(compiled.accountIndexes).map(idx => {
        const addr = accountKeys[idx] ?? '';
        return {
          address: addr,
          isSigner: sq.utils.isSignerIndex(tx.message, idx),
          isWritable: sq.utils.isStaticWritableIndex(tx.message, idx),
        };
      });
      return {
        programId,
        accounts: ixAccounts,
        data: new Uint8Array(compiled.data),
      };
    });

    return {
      ok: true,
      value: {
        kind: 'vault',
        address,
        creator,
        vaultIndex,
        vault,
        ephemeralSignerCount,
        accounts,
        instructions,
        lookupTableCount: tx.message.addressTableLookups.length,
        messageSha256,
        contextSlot,
      },
    };
  } catch (err) {
    return { ok: false, reason: `VaultTransaction deserialization failed: ${String(err)}` };
  }
}
