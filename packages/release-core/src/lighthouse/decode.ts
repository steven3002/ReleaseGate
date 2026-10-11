import { PublicKey } from '@solana/web3.js';
import { LIGHTHOUSE_PROGRAM_ID } from '../cluster/programs';
import type { Instruction } from '../chain/instruction';
import { encodeHex } from '../digest/hex';
import type { LighthouseAssertion } from './assertions';
import { decodeLeb128 } from './leb128';

export type LighthouseDecodeResult =
  | { readonly ok: true; readonly assertion: LighthouseAssertion }
  | { readonly ok: false; readonly reason: string };

/**
 * Decodes an Instruction into one of the four canonical Lighthouse assertions.
 * Rejects non-canonical encodings, unknown variants, trailing bytes, or unexpected privileges.
 */
export function decodeLighthouseAssertion(ix: Instruction): LighthouseDecodeResult {
  if (ix.programId !== LIGHTHOUSE_PROGRAM_ID) {
    return { ok: false, reason: `Expected Lighthouse program ID ${LIGHTHOUSE_PROGRAM_ID}, got ${ix.programId}` };
  }
  if (ix.accounts.length !== 1) {
    return { ok: false, reason: `Lighthouse assertion requires exactly 1 account, got ${ix.accounts.length}` };
  }
  const targetMeta = ix.accounts[0];
  if (!targetMeta) {
    return { ok: false, reason: 'Target account meta is undefined' };
  }
  if (targetMeta.isSigner) {
    return { ok: false, reason: 'Lighthouse assertion target account cannot be a signer' };
  }
  const target = targetMeta.address;

  if (ix.data.length < 3) {
    return { ok: false, reason: `Lighthouse instruction data truncated: length ${ix.data.length} < 3` };
  }

  const opcode = ix.data[0];
  const logLevel = ix.data[1];
  if (logLevel !== 0x01) {
    return { ok: false, reason: `Unsupported log level: ${logLevel} (expected 0x01 PlaintextMessage)` };
  }

  if (opcode === 0x05) {
    // AssertAccountInfo
    const variant = ix.data[2];
    switch (variant) {
      case 0x02: {
        // Owner
        if (ix.data.length !== 36) {
          return { ok: false, reason: `AssertAccountInfo Owner data length must be 36, got ${ix.data.length}` };
        }
        const operator = ix.data[35];
        if (operator !== 0x00) {
          return { ok: false, reason: `Unsupported EquatableOperator: ${operator} (expected 0x00 Equal)` };
        }
        const owner = new PublicKey(ix.data.subarray(3, 35)).toBase58();
        return {
          ok: true,
          assertion: {
            kind: 'buffer-owner',
            target,
            owner,
          },
        };
      }

      case 0x01: {
        // DataLength
        if (ix.data.length !== 12) {
          return { ok: false, reason: `AssertAccountInfo DataLength data length must be 12, got ${ix.data.length}` };
        }
        const operator = ix.data[11];
        if (operator !== 0x00) {
          return { ok: false, reason: `Unsupported IntegerOperator: ${operator} (expected 0x00 Equal)` };
        }
        const view = new DataView(ix.data.buffer, ix.data.byteOffset, ix.data.byteLength);
        const length = view.getBigUint64(3, true);
        return {
          ok: true,
          assertion: {
            kind: 'buffer-length',
            target,
            length,
          },
        };
      }

      case 0x08: {
        // VerifyDatahash
        if (ix.data.length < 35) {
          return { ok: false, reason: `AssertAccountInfo VerifyDatahash data truncated: length ${ix.data.length} < 35` };
        }
        const keccak256 = encodeHex(ix.data.subarray(3, 35));
        const startResult = decodeLeb128(ix.data, 35);
        if (!startResult.ok) {
          return { ok: false, reason: `VerifyDatahash start LEB128 decode failed: ${startResult.reason}` };
        }
        const lengthOffset = 35 + startResult.bytesRead;
        const lengthResult = decodeLeb128(ix.data, lengthOffset);
        if (!lengthResult.ok) {
          return { ok: false, reason: `VerifyDatahash length LEB128 decode failed: ${lengthResult.reason}` };
        }
        const expectedTotalLength = lengthOffset + lengthResult.bytesRead;
        if (ix.data.length !== expectedTotalLength) {
          return {
            ok: false,
            reason: `VerifyDatahash has unexpected trailing bytes: length ${ix.data.length} != ${expectedTotalLength}`,
          };
        }
        return {
          ok: true,
          assertion: {
            kind: 'buffer-hash',
            target,
            keccak256,
            start: startResult.value,
            length: lengthResult.value,
          },
        };
      }

      default:
        return { ok: false, reason: `Unsupported AssertAccountInfo assertion variant: ${variant}` };
    }
  }

  if (opcode === 0x0d) {
    // AssertUpgradeableLoaderAccount
    if (ix.data.length < 4) {
      return { ok: false, reason: `AssertUpgradeableLoaderAccount data truncated: length ${ix.data.length} < 4` };
    }
    const outerVariant = ix.data[2];
    const innerVariant = ix.data[3];
    if (outerVariant !== 0x03 || innerVariant !== 0x01) {
      return {
        ok: false,
        reason: `Unsupported AssertUpgradeableLoaderAccount variant: outer=${outerVariant}, inner=${innerVariant}`,
      };
    }
    if (ix.data.length !== 13) {
      return {
        ok: false,
        reason: `AssertUpgradeableLoaderAccount ProgramData Slot data length must be 13, got ${ix.data.length}`,
      };
    }
    const operator = ix.data[12];
    if (operator !== 0x00) {
      return { ok: false, reason: `Unsupported IntegerOperator: ${operator} (expected 0x00 Equal)` };
    }
    const view = new DataView(ix.data.buffer, ix.data.byteOffset, ix.data.byteLength);
    const slot = view.getBigUint64(4, true);
    return {
      ok: true,
      assertion: {
        kind: 'program-data-slot',
        target,
        slot,
      },
    };
  }

  return { ok: false, reason: `Unsupported Lighthouse instruction opcode: ${opcode}` };
}
