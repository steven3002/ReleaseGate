import { PublicKey } from '@solana/web3.js';
import {
  BUFFER_HEADER_SIZE,
  LOADER_STATE_BUFFER,
  LOADER_STATE_PROGRAM,
  LOADER_STATE_PROGRAM_DATA,
  LOADER_STATE_UNINITIALIZED,
  PROGRAMDATA_HEADER_SIZE,
  PROGRAM_HEADER_SIZE,
} from './layout';

export interface BufferAccountState {
  readonly authority: string | null;
  readonly payload: Uint8Array;
}

export interface ProgramAccountState {
  readonly programDataAddress: string;
}

export interface ProgramDataAccountState {
  readonly slot: bigint;
  readonly upgradeAuthority: string | null;
  readonly payload: Uint8Array;
}

export type LoaderAccountState =
  | { readonly kind: 'uninitialized' }
  | { readonly kind: 'buffer'; readonly state: BufferAccountState }
  | { readonly kind: 'program'; readonly state: ProgramAccountState }
  | { readonly kind: 'program-data'; readonly state: ProgramDataAccountState };

export type LoaderAccountDecoding =
  | { readonly ok: true; readonly value: LoaderAccountState }
  | { readonly ok: false; readonly reason: string };

export function decodeBufferAccount(
  data: Uint8Array
): { readonly ok: true; readonly value: BufferAccountState } | { readonly ok: false; readonly reason: string } {
  if (data.length < BUFFER_HEADER_SIZE) {
    return { ok: false, reason: `Buffer account data truncated: length ${data.length} < ${BUFFER_HEADER_SIZE}` };
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const tag = view.getUint32(0, true);
  if (tag !== LOADER_STATE_BUFFER) {
    return { ok: false, reason: `Expected Buffer state tag ${LOADER_STATE_BUFFER}, got ${tag}` };
  }
  const option = data[4];
  let authority: string | null = null;
  if (option === 1) {
    authority = new PublicKey(data.subarray(5, 37)).toBase58();
  } else if (option === 0) {
    authority = null;
  } else {
    return { ok: false, reason: `Invalid authority Option tag: ${option}` };
  }
  return {
    ok: true,
    value: {
      authority,
      payload: data.subarray(BUFFER_HEADER_SIZE),
    },
  };
}

export function decodeProgramAccount(
  data: Uint8Array
): { readonly ok: true; readonly value: ProgramAccountState } | { readonly ok: false; readonly reason: string } {
  if (data.length !== PROGRAM_HEADER_SIZE) {
    return { ok: false, reason: `Program account data must be exactly ${PROGRAM_HEADER_SIZE} bytes, got ${data.length}` };
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const tag = view.getUint32(0, true);
  if (tag !== LOADER_STATE_PROGRAM) {
    return { ok: false, reason: `Expected Program state tag ${LOADER_STATE_PROGRAM}, got ${tag}` };
  }
  const programDataAddress = new PublicKey(data.subarray(4, 36)).toBase58();
  return {
    ok: true,
    value: { programDataAddress },
  };
}

export function decodeProgramDataAccount(
  data: Uint8Array
): { readonly ok: true; readonly value: ProgramDataAccountState } | { readonly ok: false; readonly reason: string } {
  if (data.length < PROGRAMDATA_HEADER_SIZE) {
    return { ok: false, reason: `ProgramData account data truncated: length ${data.length} < ${PROGRAMDATA_HEADER_SIZE}` };
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const tag = view.getUint32(0, true);
  if (tag !== LOADER_STATE_PROGRAM_DATA) {
    return { ok: false, reason: `Expected ProgramData state tag ${LOADER_STATE_PROGRAM_DATA}, got ${tag}` };
  }
  const slot = view.getBigUint64(4, true);
  const option = data[12];
  let upgradeAuthority: string | null = null;
  if (option === 1) {
    upgradeAuthority = new PublicKey(data.subarray(13, 45)).toBase58();
  } else if (option === 0) {
    upgradeAuthority = null;
  } else {
    return { ok: false, reason: `Invalid upgrade authority Option tag: ${option}` };
  }
  return {
    ok: true,
    value: {
      slot,
      upgradeAuthority,
      payload: data.subarray(PROGRAMDATA_HEADER_SIZE),
    },
  };
}

export function decodeLoaderAccount(data: Uint8Array): LoaderAccountDecoding {
  if (data.length < 4) {
    return { ok: false, reason: `Loader account data truncated: length ${data.length} < 4` };
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const tag = view.getUint32(0, true);
  switch (tag) {
    case LOADER_STATE_UNINITIALIZED:
      return { ok: true, value: { kind: 'uninitialized' } };
    case LOADER_STATE_BUFFER: {
      const decoded = decodeBufferAccount(data);
      if (!decoded.ok) return decoded;
      return { ok: true, value: { kind: 'buffer', state: decoded.value } };
    }
    case LOADER_STATE_PROGRAM: {
      const decoded = decodeProgramAccount(data);
      if (!decoded.ok) return decoded;
      return { ok: true, value: { kind: 'program', state: decoded.value } };
    }
    case LOADER_STATE_PROGRAM_DATA: {
      const decoded = decodeProgramDataAccount(data);
      if (!decoded.ok) return decoded;
      return { ok: true, value: { kind: 'program-data', state: decoded.value } };
    }
    default:
      return { ok: false, reason: `Unknown Loader-v3 state tag: ${tag}` };
  }
}
