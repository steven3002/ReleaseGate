import { Buffer } from 'buffer';
import {
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
} from '@solana/web3.js';
import * as sq from '@sqds/multisig';
import type { ChainReader } from '../chain/chain-reader';
import type { Instruction } from '../chain/instruction';
import { deriveVaultPda } from './addresses';

export interface CreateGuardedProposalParams {
  readonly multisig: string;
  readonly transactionIndex: bigint;
  readonly creator: string;
  readonly vaultIndex?: number | undefined;
  readonly innerInstructions: readonly Instruction[];
}

export interface ProposalVoteParams {
  readonly multisig: string;
  readonly transactionIndex: bigint;
  readonly member: string;
}

export interface ExecuteProposalParams {
  readonly chain: ChainReader;
  readonly multisig: string;
  readonly transactionIndex: bigint;
  readonly member: string;
}

export function toCoreInstruction(ix: TransactionInstruction): Instruction {
  return {
    programId: ix.programId.toBase58(),
    accounts: ix.keys.map(k => ({
      address: k.pubkey.toBase58(),
      isSigner: k.isSigner,
      isWritable: k.isWritable,
    })),
    data: new Uint8Array(ix.data),
  };
}

export function toWeb3Instruction(ix: Instruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    data: Buffer.from(ix.data),
    keys: ix.accounts.map(k => ({
      pubkey: new PublicKey(k.address),
      isSigner: k.isSigner,
      isWritable: k.isWritable,
    })),
  });
}

/**
 * Builds the atomic proposal creation transaction instructions:
 * 1. `vaultTransactionCreate` wrapping the inner instructions with the vault as payer
 * 2. `proposalCreate` for the same transaction index
 */
export function buildCreateGuardedProposal(
  params: CreateGuardedProposalParams
): Instruction[] {
  const vaultIndex = params.vaultIndex ?? 0;
  const multisigPda = new PublicKey(params.multisig);
  const vaultAddress = deriveVaultPda(params.multisig, vaultIndex).address;
  const vaultPda = new PublicKey(vaultAddress);
  const creator = new PublicKey(params.creator);

  const innerWeb3Instructions = params.innerInstructions.map(toWeb3Instruction);
  const message = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: '11111111111111111111111111111111',
    instructions: innerWeb3Instructions,
  });

  const vaultTxIx = sq.instructions.vaultTransactionCreate({
    multisigPda,
    transactionIndex: params.transactionIndex,
    creator,
    vaultIndex,
    ephemeralSigners: 0,
    transactionMessage: message,
  });

  const proposalIx = sq.instructions.proposalCreate({
    multisigPda,
    transactionIndex: params.transactionIndex,
    creator,
  });

  return [toCoreInstruction(vaultTxIx), toCoreInstruction(proposalIx)];
}

export function buildApprove(params: ProposalVoteParams): Instruction {
  const ix = sq.instructions.proposalApprove({
    multisigPda: new PublicKey(params.multisig),
    transactionIndex: params.transactionIndex,
    member: new PublicKey(params.member),
  });
  return toCoreInstruction(ix);
}

export function buildReject(params: ProposalVoteParams): Instruction {
  const ix = sq.instructions.proposalReject({
    multisigPda: new PublicKey(params.multisig),
    transactionIndex: params.transactionIndex,
    member: new PublicKey(params.member),
  });
  return toCoreInstruction(ix);
}

/**
 * Adapts ChainReader to the connection interface required by the SDK's vaultTransactionExecute.
 */
export async function buildExecute(params: ExecuteProposalParams): Promise<Instruction> {
  const multisigPda = new PublicKey(params.multisig);
  const member = new PublicKey(params.member);

  const connectionShim = {
    getAccountInfo: async (pubkey: PublicKey) => {
      const res = await params.chain.getAccounts([pubkey.toBase58()]);
      const snapshot = res.accounts[0];
      if (!snapshot) return null;
      return {
        data: Buffer.from(snapshot.data),
        owner: new PublicKey(snapshot.owner),
        lamports: Number(snapshot.lamports),
        executable: snapshot.executable,
      };
    },
    getAddressLookupTable: async () => {
      throw new Error('Address lookup tables are not supported');
    },
  };

  const { instruction } = await sq.instructions.vaultTransactionExecute({
    connection: connectionShim as unknown as import('@solana/web3.js').Connection,
    multisigPda,
    transactionIndex: params.transactionIndex,
    member,
  });

  return toCoreInstruction(instruction);
}
