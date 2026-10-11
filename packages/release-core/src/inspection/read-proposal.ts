import type { ChainReader } from '../chain/chain-reader';
import type { MultisigSnapshot } from '../squads/multisig';
import { decodeMultisigAccount } from '../squads/multisig';
import type { ProposalStatus } from '../squads/proposal';
import { decodeProposalAccount } from '../squads/proposal';
import type { StoredTransaction } from '../squads/stored-transaction';
import { decodeStoredTransaction } from '../squads/stored-transaction';
import { deriveProposalPda, deriveTransactionPda } from '../squads/addresses';
import type { GuardAssessment } from '../guard/assess';
import { assessStoredTransaction } from '../guard/assess';
import type { ClassifiedInstruction } from './classify';
import { classifyInstructions } from './classify';
import { decodeBufferAccount, decodeProgramAccount, decodeProgramDataAccount } from '../loader-v3/accounts';

export interface ProposalSnapshot {
  readonly multisig: string;
  readonly transactionIndex: bigint;
  readonly status: ProposalStatus;
  readonly approved: readonly string[];
  readonly rejected: readonly string[];
  readonly cancelled: readonly string[];
  readonly contextSlot: number;
}

export interface ChainEvidence {
  readonly program?:
    | {
        readonly owner: string;
        readonly executable: boolean;
        readonly programDataAddress: string;
      }
    | undefined;
  readonly programData?:
    | {
        readonly owner: string;
        readonly slot: bigint;
        readonly upgradeAuthority?: string | undefined;
        readonly capacity: number;
      }
    | undefined;
  readonly buffer?:
    | {
        readonly owner: string;
        readonly authority?: string | undefined;
        readonly payload: Uint8Array;
      }
    | undefined;
  readonly contextSlot: number;
}

export interface ProposalInspection {
  readonly multisig: MultisigSnapshot;
  readonly proposal: ProposalSnapshot;
  readonly transaction: StoredTransaction;
  readonly guard: GuardAssessment;
  readonly instructions: readonly ClassifiedInstruction[];
  readonly evidence: ChainEvidence;
}

export interface ReadProposalInput {
  readonly multisig: string;
  readonly transactionIndex: bigint;
}

/**
 * Reads a proposal from the chain in two coordinated reads:
 * 1. Multisig, Proposal, and StoredTransaction in a single batch read, recording the context slot.
 * 2. If target accounts are identified (program, programData, buffer), reads them at a slot
 *    no older than the first context slot. Missing accounts are returned as data, not exceptions.
 */
export async function readProposal(
  chain: ChainReader,
  input: ReadProposalInput,
): Promise<ProposalInspection> {
  const proposalPda = deriveProposalPda(input.multisig, input.transactionIndex).address;
  const transactionPda = deriveTransactionPda(input.multisig, input.transactionIndex).address;

  // Call 1: multisig, proposal, transaction
  const read1 = await chain.getAccounts([input.multisig, proposalPda, transactionPda]);
  const firstSlot = read1.contextSlot;

  const multisigAccount = read1.accounts[0];
  if (!multisigAccount) {
    throw new Error(`Multisig account not found: ${input.multisig}`);
  }

  const proposalAccount = read1.accounts[1];
  if (!proposalAccount) {
    throw new Error(`Proposal account not found for index ${input.transactionIndex} at ${proposalPda}`);
  }

  const txAccount = read1.accounts[2];
  if (!txAccount) {
    throw new Error(`Transaction account not found for index ${input.transactionIndex} at ${transactionPda}`);
  }

  const multisigDec = decodeMultisigAccount(multisigAccount.data);
  if (!multisigDec.ok) {
    throw new Error(`Failed to decode multisig account: ${multisigDec.reason}`);
  }

  const multisigSnapshot: MultisigSnapshot = {
    address: input.multisig,
    createKey: multisigDec.value.createKey,
    configAuthority: multisigDec.value.configAuthority,
    threshold: multisigDec.value.threshold,
    timeLockSeconds: multisigDec.value.timeLockSeconds,
    transactionIndex: multisigDec.value.transactionIndex,
    staleTransactionIndex: multisigDec.value.staleTransactionIndex,
    members: multisigDec.value.members,
    contextSlot: firstSlot,
  };

  const proposalDec = decodeProposalAccount(proposalAccount.data);
  if (!proposalDec.ok) {
    throw new Error(`Failed to decode proposal account: ${proposalDec.reason}`);
  }

  const txDec = decodeStoredTransaction(transactionPda, txAccount.data, firstSlot);
  if (!txDec.ok) {
    throw new Error(`Failed to decode stored transaction account: ${txDec.reason}`);
  }

  const proposalSnapshot: ProposalSnapshot = {
    multisig: proposalDec.value.multisig,
    transactionIndex: proposalDec.value.transactionIndex,
    status: proposalDec.value.status,
    approved: proposalDec.value.approved,
    rejected: proposalDec.value.rejected,
    cancelled: proposalDec.value.cancelled,
    contextSlot: firstSlot,
  };

  const storedTx = txDec.value;
  const guard = assessStoredTransaction(storedTx);
  const instructions = classifyInstructions(storedTx.instructions);

  // Determine target accounts for Call 2
  let targetProgram: string | undefined = guard.params?.program;
  let targetProgramData: string | undefined = guard.params?.programData;
  let targetBuffer: string | undefined = guard.params?.buffer;

  if (!targetProgram || !targetProgramData || !targetBuffer) {
    for (const ix of instructions) {
      if (ix.kind === 'loader-upgrade') {
        targetProgram = targetProgram ?? ix.program;
        targetProgramData = targetProgramData ?? ix.programData;
        targetBuffer = targetBuffer ?? ix.buffer;
        break;
      }
    }
  }

  if (!targetProgram || !targetProgramData || !targetBuffer) {
    // No target accounts to query
    return {
      multisig: multisigSnapshot,
      proposal: proposalSnapshot,
      transaction: storedTx,
      guard,
      instructions,
      evidence: { contextSlot: firstSlot },
    };
  }

  // Call 2: program, programData, buffer at minContextSlot: firstSlot
  const read2 = await chain.getAccounts([targetProgram, targetProgramData, targetBuffer], {
    minContextSlot: firstSlot,
  });

  const secondSlot = read2.contextSlot;
  const rawProgram = read2.accounts[0];
  const rawProgramData = read2.accounts[1];
  const rawBuffer = read2.accounts[2];

  let progEvidence: ChainEvidence['program'];
  if (rawProgram) {
    const progDec = decodeProgramAccount(rawProgram.data);
    progEvidence = {
      owner: rawProgram.owner,
      executable: rawProgram.executable,
      programDataAddress: progDec.ok ? progDec.value.programDataAddress : '',
    };
  }

  let pdEvidence: ChainEvidence['programData'];
  if (rawProgramData) {
    const pdDec = decodeProgramDataAccount(rawProgramData.data);
    pdEvidence = {
      owner: rawProgramData.owner,
      slot: pdDec.ok ? pdDec.value.slot : 0n,
      upgradeAuthority: pdDec.ok ? (pdDec.value.upgradeAuthority ?? undefined) : undefined,
      capacity: rawProgramData.data.length,
    };
  }

  let bufEvidence: ChainEvidence['buffer'];
  if (rawBuffer) {
    const bufDec = decodeBufferAccount(rawBuffer.data);
    bufEvidence = {
      owner: rawBuffer.owner,
      authority: bufDec.ok ? (bufDec.value.authority ?? undefined) : undefined,
      payload: bufDec.ok ? bufDec.value.payload : rawBuffer.data,
    };
  }

  return {
    multisig: multisigSnapshot,
    proposal: proposalSnapshot,
    transaction: storedTx,
    guard,
    instructions,
    evidence: {
      program: progEvidence,
      programData: pdEvidence,
      buffer: bufEvidence,
      contextSlot: secondSlot,
    },
  };
}
