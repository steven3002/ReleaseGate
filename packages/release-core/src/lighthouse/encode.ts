import { PublicKey } from '@solana/web3.js';
import { LIGHTHOUSE_PROGRAM_ID } from '../cluster/programs';
import type { Instruction } from '../chain/instruction';
import { decodeHex } from '../digest/hex';
import type { LighthouseAssertion } from './assertions';
import { encodeLeb128 } from './leb128';

/**
 * Encodes a canonical Lighthouse assertion into an Instruction.
 * Supports the four canonical forms used by ReleaseGate:
 * - Buffer owner (AssertAccountInfo Owner == loader)
 * - Buffer length (AssertAccountInfo DataLength == 37 + L)
 * - Buffer hash (AssertAccountInfo VerifyDatahash)
 * - ProgramData slot (AssertUpgradeableLoaderAccount ProgramData Slot == S)
 */
export function encodeLighthouseAssertion(assertion: LighthouseAssertion): Instruction {
  const accountMeta = {
    address: assertion.target,
    isSigner: false,
    isWritable: false,
  };

  switch (assertion.kind) {
    case 'buffer-owner': {
      const ownerBytes = new PublicKey(assertion.owner).toBytes();
      const data = new Uint8Array(36);
      data[0] = 0x05; // AssertAccountInfo
      data[1] = 0x01; // PlaintextMessage
      data[2] = 0x02; // Owner
      data.set(ownerBytes, 3);
      data[35] = 0x00; // EquatableOperator::Equal
      return {
        programId: LIGHTHOUSE_PROGRAM_ID,
        accounts: [accountMeta],
        data,
      };
    }

    case 'buffer-length': {
      const data = new Uint8Array(12);
      data[0] = 0x05; // AssertAccountInfo
      data[1] = 0x01; // PlaintextMessage
      data[2] = 0x01; // DataLength
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      view.setBigUint64(3, assertion.length, true);
      data[11] = 0x00; // IntegerOperator::Equal
      return {
        programId: LIGHTHOUSE_PROGRAM_ID,
        accounts: [accountMeta],
        data,
      };
    }

    case 'buffer-hash': {
      const decodedHash = decodeHex(assertion.keccak256);
      if (!decodedHash.ok || decodedHash.bytes.length !== 32) {
        throw new Error(`Invalid 32-byte Keccak-256 hex string: ${assertion.keccak256}`);
      }
      const startLeb = encodeLeb128(assertion.start);
      const lengthLeb = encodeLeb128(assertion.length);
      const totalLen = 3 + 32 + startLeb.length + lengthLeb.length;
      const data = new Uint8Array(totalLen);
      data[0] = 0x05; // AssertAccountInfo
      data[1] = 0x01; // PlaintextMessage
      data[2] = 0x08; // VerifyDatahash
      data.set(decodedHash.bytes, 3);
      data.set(startLeb, 35);
      data.set(lengthLeb, 35 + startLeb.length);
      return {
        programId: LIGHTHOUSE_PROGRAM_ID,
        accounts: [accountMeta],
        data,
      };
    }

    case 'program-data-slot': {
      const data = new Uint8Array(13);
      data[0] = 0x0d; // AssertUpgradeableLoaderAccount
      data[1] = 0x01; // PlaintextMessage
      data[2] = 0x03; // ProgramData
      data[3] = 0x01; // Slot
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      view.setBigUint64(4, assertion.slot, true);
      data[12] = 0x00; // IntegerOperator::Equal
      return {
        programId: LIGHTHOUSE_PROGRAM_ID,
        accounts: [accountMeta],
        data,
      };
    }
  }
}
