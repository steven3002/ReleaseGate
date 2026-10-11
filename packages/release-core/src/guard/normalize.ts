import type { AccountMeta, Instruction } from '../chain/instruction';

export interface NormalizedInstruction {
  readonly programId: string;
  readonly accounts: readonly string[];
  readonly data: Uint8Array;
}

export function normalizeInstruction(ix: Instruction): NormalizedInstruction {
  return {
    programId: ix.programId,
    accounts: ix.accounts.map((a) => a.address),
    data: new Uint8Array(ix.data),
  };
}

export function normalizeInstructions(ixs: readonly Instruction[]): NormalizedInstruction[] {
  return ixs.map(normalizeInstruction);
}

export function compareBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

export function compareNormalizedInstructions(a: readonly Instruction[], b: readonly Instruction[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    const ixA = a[i];
    const ixB = b[i];
    if (!ixA || !ixB) {
      return false;
    }
    if (ixA.programId !== ixB.programId) {
      return false;
    }
    if (ixA.accounts.length !== ixB.accounts.length) {
      return false;
    }
    for (let j = 0; j < ixA.accounts.length; j++) {
      if (ixA.accounts[j]?.address !== ixB.accounts[j]?.address) {
        return false;
      }
    }
    if (!compareBytes(ixA.data, ixB.data)) {
      return false;
    }
  }
  return true;
}

export function extractSigners(accounts: readonly AccountMeta[]): string[] {
  const signers = new Set<string>();
  for (const acc of accounts) {
    if (acc.isSigner) {
      signers.add(acc.address);
    }
  }
  return Array.from(signers).sort();
}

export function extractWritables(accounts: readonly AccountMeta[]): string[] {
  const writables = new Set<string>();
  for (const acc of accounts) {
    if (acc.isWritable) {
      writables.add(acc.address);
    }
  }
  return Array.from(writables).sort();
}

export function extractReferencedAccounts(instructions: readonly Instruction[]): string[] {
  const referenced = new Set<string>();
  for (const ix of instructions) {
    referenced.add(ix.programId);
    for (const acc of ix.accounts) {
      referenced.add(acc.address);
    }
  }
  return Array.from(referenced).sort();
}

export function areStringSetsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const setA = new Set(a);
  if (setA.size !== b.length) {
    return false;
  }
  for (const item of b) {
    if (!setA.has(item)) {
      return false;
    }
  }
  return true;
}
