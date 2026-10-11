import { LOADER_V3_PROGRAM_ID, SYSVAR_CLOCK_ID, SYSVAR_RENT_ID } from '../cluster/programs';
import type { Instruction } from '../chain/instruction';

export interface UpgradeInstructionAccounts {
  readonly programData: string;
  readonly program: string;
  readonly buffer: string;
  readonly spill: string;
  readonly rentSysvar: string;
  readonly clockSysvar: string;
  readonly authority: string;
}

export type UpgradeInstructionDecoding =
  | { readonly ok: true; readonly accounts: UpgradeInstructionAccounts }
  | { readonly ok: false; readonly reason: string };

const UPGRADE_DATA = new Uint8Array([3, 0, 0, 0]);

export function encodeUpgradeInstruction(accounts: UpgradeInstructionAccounts): Instruction {
  return {
    programId: LOADER_V3_PROGRAM_ID,
    data: new Uint8Array(UPGRADE_DATA),
    accounts: [
      { address: accounts.programData, isSigner: false, isWritable: true },
      { address: accounts.program, isSigner: false, isWritable: true },
      { address: accounts.buffer, isSigner: false, isWritable: true },
      { address: accounts.spill, isSigner: false, isWritable: true },
      { address: accounts.rentSysvar, isSigner: false, isWritable: false },
      { address: accounts.clockSysvar, isSigner: false, isWritable: false },
      { address: accounts.authority, isSigner: true, isWritable: false },
    ],
  };
}

export function decodeUpgradeInstruction(ix: Instruction): UpgradeInstructionDecoding {
  if (ix.programId !== LOADER_V3_PROGRAM_ID) {
    return { ok: false, reason: `Expected loader program ${LOADER_V3_PROGRAM_ID}, got ${ix.programId}` };
  }
  if (ix.data.length !== 4) {
    return { ok: false, reason: `Upgrade instruction data must be 4 bytes, got ${ix.data.length}` };
  }
  if (ix.data[0] !== 3 || ix.data[1] !== 0 || ix.data[2] !== 0 || ix.data[3] !== 0) {
    return { ok: false, reason: `Expected Upgrade opcode 0x00000003, got data [${Array.from(ix.data).join(', ')}]` };
  }
  if (ix.accounts.length !== 7) {
    return { ok: false, reason: `Upgrade instruction expects 7 accounts, got ${ix.accounts.length}` };
  }

  const [pd, prog, buf, spill, rent, clock, auth] = ix.accounts;
  if (!pd || pd.isSigner || !pd.isWritable) {
    return { ok: false, reason: 'Account 0 (programData) must be writable non-signer' };
  }
  if (!prog || prog.isSigner || !prog.isWritable) {
    return { ok: false, reason: 'Account 1 (program) must be writable non-signer' };
  }
  if (!buf || buf.isSigner || !buf.isWritable) {
    return { ok: false, reason: 'Account 2 (buffer) must be writable non-signer' };
  }
  if (!spill || spill.isSigner || !spill.isWritable) {
    return { ok: false, reason: 'Account 3 (spill) must be writable non-signer' };
  }
  if (!rent || rent.isSigner || rent.isWritable || rent.address !== SYSVAR_RENT_ID) {
    return { ok: false, reason: 'Account 4 (rentSysvar) must be readonly non-signer rent sysvar' };
  }
  if (!clock || clock.isSigner || clock.isWritable || clock.address !== SYSVAR_CLOCK_ID) {
    return { ok: false, reason: 'Account 5 (clockSysvar) must be readonly non-signer clock sysvar' };
  }
  if (!auth || !auth.isSigner) {
    return { ok: false, reason: 'Account 6 (authority) must be a signer' };
  }

  return {
    ok: true,
    accounts: {
      programData: pd.address,
      program: prog.address,
      buffer: buf.address,
      spill: spill.address,
      rentSysvar: rent.address,
      clockSysvar: clock.address,
      authority: auth.address,
    },
  };
}
