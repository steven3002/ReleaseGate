import { Buffer } from 'buffer';
import type { Transaction } from '@solana/web3.js';

/**
 * Validates that the returned transaction message is byte-identical to the built transaction message.
 * Enforces Pass Mark 11: transaction message cannot be altered by wallet.
 */
export function verifySignedTransactionMessage(
  builtTransaction: Transaction,
  signedTransaction: Transaction
): void {
  const builtMessageBytes = builtTransaction.serializeMessage();
  const returnedMessageBytes = signedTransaction.serializeMessage();
  if (Buffer.compare(builtMessageBytes, returnedMessageBytes) !== 0) {
    throw new Error('Wallet altered transaction message bytes; signature refused');
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
