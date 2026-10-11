import type { StoredTransaction } from '../squads/stored-transaction';
import { LOADER_V3_PROGRAM_ID, SYSVAR_CLOCK_ID, SYSVAR_RENT_ID } from '../cluster/programs';
import { decodeLighthouseAssertion } from '../lighthouse/decode';
import type { LighthouseAssertion } from '../lighthouse/assertions';
import { BUFFER_HEADER_SIZE } from '../loader-v3/layout';
import { deriveProgramDataAddress } from '../loader-v3/program-data-address';
import { decodeUpgradeInstruction } from '../loader-v3/upgrade-instruction';
import {
  areStringSetsEqual,
  compareNormalizedInstructions,
  extractReferencedAccounts,
  extractSigners,
  extractWritables,
} from './normalize';
import { buildGuardedUpgrade } from './template';

export type GuardShape = 'guarded-upgrade' | 'partial-guard' | 'unguarded-upgrade' | 'unsupported';

export interface GuardAssessmentParams {
  readonly program: string;
  readonly programData: string;
  readonly buffer: string;
  readonly spill: string;
  readonly vault: string;
  readonly payloadLength?: bigint;
  readonly keccak256?: string;
  readonly deploymentSlot?: bigint;
}

export interface GuardAssessment {
  readonly shape: GuardShape;
  readonly params?: GuardAssessmentParams;
  readonly findings: readonly string[];
}

const CANONICAL_KINDS = [
  'buffer-owner',
  'buffer-length',
  'buffer-hash',
  'program-data-slot',
] as const;

export function assessStoredTransaction(tx: StoredTransaction): GuardAssessment {

  if (tx.kind !== 'vault') {
    return { shape: 'unsupported', findings: ['Transaction is not a Squads vault transaction'] };
  }
  if (tx.lookupTableCount > 0) {
    return { shape: 'unsupported', findings: ['Address lookup tables are not supported'] };
  }
  if ((tx.ephemeralSignerCount ?? 0) > 0) {
    return { shape: 'unsupported', findings: ['Ephemeral signers are not supported'] };
  }
  if (tx.instructions.length === 0) {
    return { shape: 'unsupported', findings: ['Transaction contains no instructions'] };
  }

  // 1. Upgrade instruction must be the final instruction
  const lastIx = tx.instructions[tx.instructions.length - 1];
  if (!lastIx) {
    return { shape: 'unsupported', findings: ['Missing last instruction'] };
  }
  const upgradeDec = decodeUpgradeInstruction(lastIx);
  if (!upgradeDec.ok) {
    return { shape: 'unsupported', findings: [`Last instruction is not a Loader-v3 Upgrade: ${upgradeDec.reason}`] };
  }

  const { program, programData, buffer, spill, rentSysvar, clockSysvar, authority } = upgradeDec.accounts;

  // 2. Structural checks on Upgrade accounts
  if (rentSysvar !== SYSVAR_RENT_ID || clockSysvar !== SYSVAR_CLOCK_ID) {
    return { shape: 'unsupported', findings: ['Upgrade instruction has invalid sysvar accounts'] };
  }

  const expectedProgramData = deriveProgramDataAddress(program);
  if (programData !== expectedProgramData) {
    return {
      shape: 'unsupported',
      findings: [`ProgramData address ${programData} does not match derived address ${expectedProgramData}`],
    };
  }

  if (spill === program || spill === programData || spill === buffer) {
    return { shape: 'unsupported', findings: ['Spill account cannot be program, programData, or buffer'] };
  }

  if (tx.vault && authority !== tx.vault) {
    return {
      shape: 'unsupported',
      findings: [`Upgrade authority ${authority} does not match transaction vault ${tx.vault}`],
    };
  }

  // 3. Exactly one signer, the vault authority
  const signers = extractSigners(tx.accounts);
  if (signers.length !== 1 || signers[0] !== authority) {
    return {
      shape: 'unsupported',
      findings: [`Expected exactly one signer (${authority}), found ${signers.join(', ')}`],
    };
  }

  // 4. Canonical writable set: exactly vault, programData, program, buffer, spill
  const expectedWritables = [authority, programData, program, buffer, spill].sort();
  const actualWritables = extractWritables(tx.accounts);
  if (!areStringSetsEqual(actualWritables, expectedWritables)) {
    return {
      shape: 'unsupported',
      findings: [`Writable accounts do not match canonical set. Found: ${actualWritables.join(', ')}`],
    };
  }

  // 5. No unused account keys and no undeclared referenced accounts
  const referenced = extractReferencedAccounts(tx.instructions);
  const referencedSet = new Set(referenced);
  for (const acc of tx.accounts) {
    if (!referencedSet.has(acc.address)) {
      return { shape: 'unsupported', findings: [`Unused account key in transaction accounts: ${acc.address}`] };
    }
  }

  const preceding = tx.instructions.slice(0, -1);

  // 6. Case: lone Upgrade
  if (preceding.length === 0) {
    return {
      shape: 'unguarded-upgrade',
      params: { program, programData, buffer, spill, vault: authority },
      findings: ['Transaction contains Upgrade without guard assertions'],
    };
  }

  // 7. Decode preceding instructions as Lighthouse assertions
  const parsedAssertions: LighthouseAssertion[] = [];
  for (let i = 0; i < preceding.length; i++) {
    const ix = preceding[i];
    if (!ix) {
      return { shape: 'unsupported', findings: [`Missing instruction at index ${i}`] };
    }
    const dec = decodeLighthouseAssertion(ix);
    if (!dec.ok) {
      return {
        shape: 'unsupported',
        findings: [`Instruction ${i} is not a supported Lighthouse assertion: ${dec.reason}`],
      };
    }
    parsedAssertions.push(dec.assertion);
  }

  // Check each assertion's parameters against canonical targets
  let extractedLength: bigint | undefined;
  let extractedHash: string | undefined;
  let extractedSlot: bigint | undefined;

  for (let i = 0; i < parsedAssertions.length; i++) {
    const assertion = parsedAssertions[i];
    if (!assertion) continue;

    if (assertion.kind === 'buffer-owner') {
      if (assertion.target !== buffer) {
        return { shape: 'unsupported', findings: [`Buffer owner assertion targets ${assertion.target}, expected ${buffer}`] };
      }
      if (assertion.owner !== LOADER_V3_PROGRAM_ID) {
        return { shape: 'unsupported', findings: [`Buffer owner assertion requires ${assertion.owner}, expected ${LOADER_V3_PROGRAM_ID}`] };
      }
    } else if (assertion.kind === 'buffer-length') {
      if (assertion.target !== buffer) {
        return { shape: 'unsupported', findings: [`Buffer length assertion targets ${assertion.target}, expected ${buffer}`] };
      }
      if (assertion.length <= BigInt(BUFFER_HEADER_SIZE)) {
        return { shape: 'unsupported', findings: [`Buffer length assertion must exceed header size 37, got ${assertion.length}`] };
      }
      extractedLength = assertion.length - BigInt(BUFFER_HEADER_SIZE);
    } else if (assertion.kind === 'buffer-hash') {
      if (assertion.target !== buffer) {
        return { shape: 'unsupported', findings: [`Buffer hash assertion targets ${assertion.target}, expected ${buffer}`] };
      }
      if (assertion.start !== BigInt(BUFFER_HEADER_SIZE)) {
        return { shape: 'unsupported', findings: [`Buffer hash start must be 37, got ${assertion.start}`] };
      }
      if (extractedLength !== undefined && assertion.length !== extractedLength) {
        return { shape: 'unsupported', findings: [`Buffer hash length ${assertion.length} does not match buffer length assertion ${extractedLength}`] };
      }
      extractedHash = assertion.keccak256;
      if (extractedLength === undefined) {
        extractedLength = assertion.length;
      }
    } else if (assertion.kind === 'program-data-slot') {
      if (assertion.target !== programData) {
        return { shape: 'unsupported', findings: [`ProgramData slot assertion targets ${assertion.target}, expected ${programData}`] };
      }
      extractedSlot = assertion.slot;
    }
  }

  // Check sequence order: must be a strictly increasing sub-sequence of CANONICAL_KINDS
  let lastCanonicalIdx = -1;
  const kindsPresent = new Set<string>();
  for (const assertion of parsedAssertions) {
    const canonicalIdx = CANONICAL_KINDS.indexOf(assertion.kind);
    if (canonicalIdx <= lastCanonicalIdx) {
      return { shape: 'unsupported', findings: ['Lighthouse assertions are out of canonical order or duplicated'] };
    }
    lastCanonicalIdx = canonicalIdx;
    kindsPresent.add(assertion.kind);
  }

  // 8. Canonical guarded-upgrade check: exactly all 4 assertions
  if (parsedAssertions.length === 4) {
    if (extractedLength === undefined || extractedHash === undefined || extractedSlot === undefined) {
      return { shape: 'unsupported', findings: ['Incomplete guard parameters'] };
    }

    const rebuilt = buildGuardedUpgrade({
      program,
      programData,
      buffer,
      spill,
      vault: authority,
      payloadLength: extractedLength,
      keccak256: extractedHash,
      deploymentSlot: extractedSlot,
    });

    if (!compareNormalizedInstructions(tx.instructions, rebuilt)) {
      return { shape: 'unsupported', findings: ['Instruction sequence does not match canonical guarded upgrade template'] };
    }

    return {
      shape: 'guarded-upgrade',
      params: {
        program,
        programData,
        buffer,
        spill,
        vault: authority,
        payloadLength: extractedLength,
        keccak256: extractedHash,
        deploymentSlot: extractedSlot,
      },
      findings: [],
    };
  }

  // 9. Partial guard: strictly a subset of canonical assertions
  const missingFindings: string[] = [];
  if (!kindsPresent.has('buffer-owner')) {
    missingFindings.push('Missing buffer owner assertion');
  }
  if (!kindsPresent.has('buffer-length')) {
    missingFindings.push('Missing buffer length assertion');
  }
  if (!kindsPresent.has('buffer-hash')) {
    missingFindings.push('Missing buffer hash assertion');
  }
  if (!kindsPresent.has('program-data-slot')) {
    missingFindings.push('Missing deployment slot assertion');
  }

  return {
    shape: 'partial-guard',
    params: {
      program,
      programData,
      buffer,
      spill,
      vault: authority,
      ...(extractedLength !== undefined ? { payloadLength: extractedLength } : {}),
      ...(extractedHash !== undefined ? { keccak256: extractedHash } : {}),
      ...(extractedSlot !== undefined ? { deploymentSlot: extractedSlot } : {}),
    },
    findings: missingFindings,
  };
}
