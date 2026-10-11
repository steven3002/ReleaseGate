import type { Instruction } from '../chain/instruction';
import { LOADER_V3_PROGRAM_ID, SYSVAR_CLOCK_ID, SYSVAR_RENT_ID } from '../cluster/programs';
import { encodeLighthouseAssertion } from '../lighthouse/encode';
import { BUFFER_HEADER_SIZE } from '../loader-v3/layout';
import { encodeUpgradeInstruction } from '../loader-v3/upgrade-instruction';

export interface GuardParams {
  readonly program: string;
  readonly programData: string;
  readonly buffer: string;
  readonly spill: string;
  readonly vault: string;
  readonly payloadLength: bigint;
  readonly keccak256: string;
  readonly deploymentSlot: bigint;
}

/**
 * Builds the canonical five instructions for a guarded upgrade:
 * 1. Lighthouse: AssertAccountInfo Owner == loader (target: buffer)
 * 2. Lighthouse: AssertAccountInfo DataLength == 37 + L (target: buffer)
 * 3. Lighthouse: AssertAccountInfo VerifyDatahash over [37, 37 + L) == keccak (target: buffer)
 * 4. Lighthouse: AssertUpgradeableLoaderAccount ProgramData Slot == S (target: programData)
 * 5. Loader-v3: Upgrade (targets: programData, program, buffer, spill, rent, clock, vault)
 */
export function buildGuardedUpgrade(params: GuardParams): Instruction[] {
  const totalLength = BigInt(BUFFER_HEADER_SIZE) + params.payloadLength;

  const ix1 = encodeLighthouseAssertion({
    kind: 'buffer-owner',
    target: params.buffer,
    owner: LOADER_V3_PROGRAM_ID,
  });

  const ix2 = encodeLighthouseAssertion({
    kind: 'buffer-length',
    target: params.buffer,
    length: totalLength,
  });

  const ix3 = encodeLighthouseAssertion({
    kind: 'buffer-hash',
    target: params.buffer,
    keccak256: params.keccak256,
    start: BigInt(BUFFER_HEADER_SIZE),
    length: params.payloadLength,
  });

  const ix4 = encodeLighthouseAssertion({
    kind: 'program-data-slot',
    target: params.programData,
    slot: params.deploymentSlot,
  });

  const ix5 = encodeUpgradeInstruction({
    programData: params.programData,
    program: params.program,
    buffer: params.buffer,
    spill: params.spill,
    rentSysvar: SYSVAR_RENT_ID,
    clockSysvar: SYSVAR_CLOCK_ID,
    authority: params.vault,
  });

  return [ix1, ix2, ix3, ix4, ix5];
}
