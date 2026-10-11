import type { Instruction } from '../chain/instruction';
import { LIGHTHOUSE_PROGRAM_ID, LOADER_V3_PROGRAM_ID } from '../cluster/programs';
import { encodeHex } from '../digest/hex';
import { decodeLighthouseAssertion } from '../lighthouse/decode';
import { decodeUpgradeInstruction } from '../loader-v3/upgrade-instruction';

export type ClassifiedInstruction =
  | { readonly kind: 'assert-buffer-owner'; readonly target: string; readonly owner: string }
  | { readonly kind: 'assert-buffer-length'; readonly target: string; readonly length: bigint }
  | {
      readonly kind: 'assert-buffer-hash';
      readonly target: string;
      readonly keccak256: string;
      readonly start: bigint;
      readonly length: bigint;
    }
  | { readonly kind: 'assert-deployment-slot'; readonly target: string; readonly slot: bigint }
  | {
      readonly kind: 'loader-upgrade';
      readonly programData: string;
      readonly program: string;
      readonly buffer: string;
      readonly spill: string;
      readonly authority: string;
    }
  | {
      readonly kind: 'unsupported';
      readonly programId: string;
      readonly reason: string;
      readonly dataHex: string;
    };

export function classifyInstruction(ix: Instruction): ClassifiedInstruction {
  if (ix.programId === LIGHTHOUSE_PROGRAM_ID) {
    const dec = decodeLighthouseAssertion(ix);
    if (!dec.ok) {
      return {
        kind: 'unsupported',
        programId: ix.programId,
        reason: dec.reason,
        dataHex: encodeHex(ix.data),
      };
    }

    const { assertion } = dec;
    switch (assertion.kind) {
      case 'buffer-owner':
        return { kind: 'assert-buffer-owner', target: assertion.target, owner: assertion.owner };
      case 'buffer-length':
        return { kind: 'assert-buffer-length', target: assertion.target, length: assertion.length };
      case 'buffer-hash':
        return {
          kind: 'assert-buffer-hash',
          target: assertion.target,
          keccak256: assertion.keccak256,
          start: assertion.start,
          length: assertion.length,
        };
      case 'program-data-slot':
        return { kind: 'assert-deployment-slot', target: assertion.target, slot: assertion.slot };
    }
  }

  if (ix.programId === LOADER_V3_PROGRAM_ID) {
    const dec = decodeUpgradeInstruction(ix);
    if (!dec.ok) {
      return {
        kind: 'unsupported',
        programId: ix.programId,
        reason: dec.reason,
        dataHex: encodeHex(ix.data),
      };
    }

    return {
      kind: 'loader-upgrade',
      programData: dec.accounts.programData,
      program: dec.accounts.program,
      buffer: dec.accounts.buffer,
      spill: dec.accounts.spill,
      authority: dec.accounts.authority,
    };
  }

  return {
    kind: 'unsupported',
    programId: ix.programId,
    reason: `Unrecognized program ID ${ix.programId}`,
    dataHex: encodeHex(ix.data),
  };
}

export function classifyInstructions(ixs: readonly Instruction[]): ClassifiedInstruction[] {
  return ixs.map(classifyInstruction);
}
