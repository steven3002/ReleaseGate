import { Buffer } from 'buffer';
import type { Transaction, TransactionInstruction } from '@solana/web3.js';
import { LIGHTHOUSE_PROGRAM_ID } from 'release-core';

const COMPUTE_BUDGET_PROGRAM_ID = 'ComputeBudget111111111111111111111111111111';

/**
 * Programs a wallet may add instructions for before signing: assertion guards,
 * which can only make the transaction fail, and compute budget settings, which
 * only affect its fee.
 */
const WALLET_ADDED_PROGRAMS: ReadonlySet<string> = new Set([
  LIGHTHOUSE_PROGRAM_ID,
  COMPUTE_BUDGET_PROGRAM_ID,
]);

/**
 * Raised when a wallet returns a transaction that no longer carries what was built.
 */
export class WalletIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WalletIntegrityError';
  }
}

function sameInstruction(a: TransactionInstruction, b: TransactionInstruction): boolean {
  return (
    a.programId.equals(b.programId) &&
    a.keys.length === b.keys.length &&
    a.keys.every((key, i) => key.pubkey.equals(b.keys[i]!.pubkey)) &&
    Buffer.compare(Buffer.from(a.data), Buffer.from(b.data)) === 0
  );
}

/**
 * True when the signed transaction keeps the fee payer, blockhash, signer count
 * and every built instruction in order, and anything extra targets only
 * programs in WALLET_ADDED_PROGRAMS.
 */
function isGuardOnlyExtension(
  builtTransaction: Transaction,
  signedTransaction: Transaction
): boolean {
  if (
    !builtTransaction.feePayer ||
    !signedTransaction.feePayer ||
    !builtTransaction.feePayer.equals(signedTransaction.feePayer) ||
    builtTransaction.recentBlockhash !== signedTransaction.recentBlockhash
  ) {
    return false;
  }

  const builtSigners = builtTransaction.compileMessage().header.numRequiredSignatures;
  const signedSigners = signedTransaction.compileMessage().header.numRequiredSignatures;
  if (builtSigners !== signedSigners) {
    return false;
  }

  const built = builtTransaction.instructions;
  let matched = 0;
  for (const instruction of signedTransaction.instructions) {
    const expected = built[matched];
    if (expected && sameInstruction(expected, instruction)) {
      matched += 1;
    } else if (!WALLET_ADDED_PROGRAMS.has(instruction.programId.toBase58())) {
      return false;
    }
  }
  return matched === built.length;
}

/**
 * Validates that the wallet signed what was built. A byte-identical message
 * passes; so does one where the wallet only added guard or compute budget
 * instructions around the unchanged built instructions. Anything else is refused.
 */
export function verifySignedTransactionMessage(
  builtTransaction: Transaction,
  signedTransaction: Transaction
): void {
  const builtMessageBytes = builtTransaction.serializeMessage();
  const returnedMessageBytes = signedTransaction.serializeMessage();
  if (Buffer.compare(builtMessageBytes, returnedMessageBytes) === 0) {
    return;
  }
  if (!isGuardOnlyExtension(builtTransaction, signedTransaction)) {
    throw new WalletIntegrityError(
      'Wallet altered the reviewed transaction; the signed transaction was not broadcast'
    );
  }
}

/**
 * Validates that the member's signature is present in the signed transaction.
 */
export function verifyMemberSignature(
  signedTransaction: Transaction,
  member: string
): void {
  const memberSignature = signedTransaction.signatures.find(
    (s) => s.publicKey.toBase58() === member
  );
  if (
    !memberSignature ||
    !memberSignature.signature ||
    memberSignature.signature.every((b) => b === 0)
  ) {
    throw new Error('Member signature missing from signed transaction');
  }
}

/**
 * Validates that the authorized wallet account matches the requested workspace member.
 */
export function verifyAuthorizedMember(
  authorizedMember: string,
  expectedMember: string
): void {
  if (authorizedMember !== expectedMember) {
    throw new Error(
      `Connected account ${authorizedMember} is not the selected member ${expectedMember}`
    );
  }
}
