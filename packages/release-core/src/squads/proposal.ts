import { Buffer } from 'buffer';
import * as sq from '@sqds/multisig';
import { encodeHex } from '../digest/hex';

export type ProposalStatusKind =
  | 'Draft'
  | 'Active'
  | 'Rejected'
  | 'Approved'
  | 'Executing'
  | 'Executed'
  | 'Cancelled';

export interface ProposalStatus {
  readonly kind: ProposalStatusKind;
  readonly timestamp?: bigint | undefined;
}

export interface ProposalAccount {
  readonly multisig: string;
  readonly transactionIndex: bigint;
  readonly status: ProposalStatus;
  readonly bump: number;
  readonly approved: readonly string[];
  readonly rejected: readonly string[];
  readonly cancelled: readonly string[];
}

export type ProposalDecoding =
  | { readonly ok: true; readonly value: ProposalAccount }
  | { readonly ok: false; readonly reason: string };

export const PROPOSAL_DISCRIMINATOR = '1a5ebdbb74883521';

/**
 * Decodes a raw Squads Proposal account data buffer into a typed ProposalAccount.
 * Validates the 8-byte discriminator before attempting deserialization.
 */
export function decodeProposalAccount(data: Uint8Array): ProposalDecoding {
  if (data.length < 8) {
    return { ok: false, reason: `Proposal account data truncated: length ${data.length} < 8` };
  }

  const discriminator = encodeHex(data.subarray(0, 8));
  if (discriminator !== PROPOSAL_DISCRIMINATOR) {
    return {
      ok: false,
      reason: `Invalid Proposal discriminator: expected ${PROPOSAL_DISCRIMINATOR}, got ${discriminator}`,
    };
  }

  try {
    const [prop] = sq.accounts.Proposal.deserialize(Buffer.from(data));
    const statusKind = prop.status.__kind as ProposalStatusKind;
    const timestamp =
      'timestamp' in prop.status && prop.status.timestamp
        ? BigInt(prop.status.timestamp.toString(10))
        : undefined;

    return {
      ok: true,
      value: {
        multisig: prop.multisig.toBase58(),
        transactionIndex: BigInt(prop.transactionIndex.toString(10)),
        status: {
          kind: statusKind,
          timestamp,
        },
        bump: prop.bump,
        approved: prop.approved.map(k => k.toBase58()),
        rejected: prop.rejected.map(k => k.toBase58()),
        cancelled: prop.cancelled.map(k => k.toBase58()),
      },
    };
  } catch (err) {
    return { ok: false, reason: `Proposal deserialization failed: ${String(err)}` };
  }
}
