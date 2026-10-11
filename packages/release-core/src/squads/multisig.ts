import { Buffer } from 'buffer';
import { PublicKey } from '@solana/web3.js';
import * as sq from '@sqds/multisig';
import { encodeHex } from '../digest/hex';
import type { MemberPermissions } from './permissions';
import { parsePermissions } from './permissions';

export interface MultisigMember {
  readonly address: string;
  readonly permissions: MemberPermissions;
}

export interface MultisigAccount {
  readonly createKey: string;
  readonly configAuthority: string | null;
  readonly threshold: number;
  readonly timeLockSeconds: bigint;
  readonly transactionIndex: bigint;
  readonly staleTransactionIndex: bigint;
  readonly rentCollector: string | null;
  readonly bump: number;
  readonly members: readonly MultisigMember[];
}

export interface MultisigSnapshot {
  readonly address: string;
  readonly createKey: string;
  readonly configAuthority: string | null;
  readonly threshold: number;
  readonly timeLockSeconds: bigint;
  readonly transactionIndex: bigint;
  readonly staleTransactionIndex: bigint;
  readonly members: readonly MultisigMember[];
  readonly contextSlot: number;
}

export type MultisigDecoding =
  | { readonly ok: true; readonly value: MultisigAccount }
  | { readonly ok: false; readonly reason: string };

export const MULTISIG_DISCRIMINATOR = 'e07479ba44a14fec';

/**
 * Decodes a raw Squads Multisig account data buffer into a typed MultisigAccount.
 * Validates the 8-byte discriminator before attempting deserialization.
 */
export function decodeMultisigAccount(data: Uint8Array): MultisigDecoding {
  if (data.length < 8) {
    return { ok: false, reason: `Multisig account data truncated: length ${data.length} < 8` };
  }

  const discriminator = encodeHex(data.subarray(0, 8));
  if (discriminator !== MULTISIG_DISCRIMINATOR) {
    return {
      ok: false,
      reason: `Invalid Multisig discriminator: expected ${MULTISIG_DISCRIMINATOR}, got ${discriminator}`,
    };
  }

  try {
    const [ms] = sq.accounts.Multisig.deserialize(Buffer.from(data));
    const configAuthority =
      ms.configAuthority && !ms.configAuthority.equals(PublicKey.default)
        ? ms.configAuthority.toBase58()
        : null;

    const rentCollector =
      ms.rentCollector && !ms.rentCollector.equals(PublicKey.default)
        ? ms.rentCollector.toBase58()
        : null;

    const members: MultisigMember[] = ms.members.map(m => ({
      address: m.key.toBase58(),
      permissions: parsePermissions(m.permissions.mask),
    }));

    return {
      ok: true,
      value: {
        createKey: ms.createKey.toBase58(),
        configAuthority,
        threshold: ms.threshold,
        timeLockSeconds: BigInt(ms.timeLock.toString(10)),
        transactionIndex: BigInt(ms.transactionIndex.toString(10)),
        staleTransactionIndex: BigInt(ms.staleTransactionIndex.toString(10)),
        rentCollector,
        bump: ms.bump,
        members,
      },
    };
  } catch (err) {
    return { ok: false, reason: `Multisig deserialization failed: ${String(err)}` };
  }
}
