import { LOADER_V3_PROGRAM_ID } from '../cluster/programs';
import {
  LOADER_STATE_PROGRAM,
  LOADER_STATE_PROGRAM_DATA,
  PROGRAMDATA_HEADER_SIZE,
} from '../loader-v3/layout';
import { deriveProgramDataAddress } from '../loader-v3/program-data-address';
import {
  createFailCheck,
  createNoticeCheck,
  createPassCheck,
  createUnknownCheck,
  type CheckResult,
} from './check';

export interface DeploymentCheckInput {
  readonly programAddress?: string | undefined;
  readonly programAccount?: {
    readonly owner: string;
    readonly executable: boolean;
    readonly programDataAddress?: string | undefined;
    readonly rawData?: Uint8Array | undefined;
    readonly stateTag?: number | undefined;
  } | undefined;
  readonly expectedProgramDataAddress?: string | undefined;
  readonly programDataAccount?: {
    readonly owner: string;
    readonly slot?: bigint | undefined;
    readonly upgradeAuthority?: string | null | undefined;
    readonly capacity?: number | undefined;
    readonly rawData?: Uint8Array | undefined;
    readonly stateTag?: number | undefined;
  } | undefined;
  readonly vault?: string | undefined;
  readonly manifestExpectedDeploymentSlot?: bigint | undefined;
  readonly artifactLength?: number | undefined;
}

export function runDeploymentChecks(input: DeploymentCheckInput): CheckResult[] {
  const results: CheckResult[] = [];
  const prog = input.programAccount;
  const pdata = input.programDataAccount;

  // 1. program.account
  if (!prog) {
    results.push(
      createUnknownCheck(
        'program.account',
        'deployment',
        'Program account data unavailable'
      )
    );
  } else if (prog.owner !== LOADER_V3_PROGRAM_ID) {
    results.push(
      createFailCheck(
        'program.account',
        'deployment',
        LOADER_V3_PROGRAM_ID,
        prog.owner,
        `Program owner is ${prog.owner}, expected loader`
      )
    );
  } else if (!prog.executable) {
    results.push(
      createFailCheck(
        'program.account',
        'deployment',
        true,
        false,
        'Program account is not marked executable'
      )
    );
  } else {
    const isProgramState =
      prog.stateTag !== undefined
        ? prog.stateTag === LOADER_STATE_PROGRAM
        : prog.rawData !== undefined && prog.rawData.length >= 4
          ? new DataView(
              prog.rawData.buffer,
              prog.rawData.byteOffset,
              prog.rawData.byteLength
            ).getUint32(0, true) === LOADER_STATE_PROGRAM
          : prog.programDataAddress !== undefined;

    if (!isProgramState) {
      results.push(
        createFailCheck(
          'program.account',
          'deployment',
          'Program (variant 2)',
          prog.stateTag !== undefined ? `variant ${prog.stateTag}` : 'unknown',
          'Program account is not in Program state'
        )
      );
    } else {
      let derivedAddress: string | undefined;
      if (input.programAddress) {
        try {
          derivedAddress = deriveProgramDataAddress(input.programAddress);
        } catch {
          derivedAddress = undefined;
        }
      }
      const targetPData = input.expectedProgramDataAddress ?? derivedAddress;

      if (!targetPData) {
        results.push(
          createUnknownCheck(
            'program.account',
            'deployment',
            'Expected program data address unavailable for verification'
          )
        );
      } else if (prog.programDataAddress !== targetPData) {
        results.push(
          createFailCheck(
            'program.account',
            'deployment',
            targetPData,
            prog.programDataAddress ?? 'none',
            'Program account does not point to the expected ProgramData address'
          )
        );
      } else {
        results.push(createPassCheck('program.account', 'deployment'));
      }
    }
  }

  // 2. programdata.state
  if (!pdata) {
    results.push(
      createUnknownCheck(
        'programdata.state',
        'deployment',
        'ProgramData account data unavailable'
      )
    );
  } else if (pdata.owner !== LOADER_V3_PROGRAM_ID) {
    results.push(
      createFailCheck(
        'programdata.state',
        'deployment',
        LOADER_V3_PROGRAM_ID,
        pdata.owner,
        `ProgramData owner is ${pdata.owner}, expected loader`
      )
    );
  } else {
    const isProgramDataState =
      pdata.stateTag !== undefined
        ? pdata.stateTag === LOADER_STATE_PROGRAM_DATA
        : pdata.rawData !== undefined && pdata.rawData.length >= 4
          ? new DataView(
              pdata.rawData.buffer,
              pdata.rawData.byteOffset,
              pdata.rawData.byteLength
            ).getUint32(0, true) === LOADER_STATE_PROGRAM_DATA
          : pdata.slot !== undefined;

    if (!isProgramDataState) {
      results.push(
        createFailCheck(
          'programdata.state',
          'deployment',
          'ProgramData (variant 3)',
          pdata.stateTag !== undefined ? `variant ${pdata.stateTag}` : 'unknown',
          'ProgramData account is not in ProgramData state'
        )
      );
    } else {
      results.push(createPassCheck('programdata.state', 'deployment'));
    }
  }

  // 3. programdata.authority
  if (!pdata) {
    results.push(
      createUnknownCheck(
        'programdata.authority',
        'deployment',
        'ProgramData account data unavailable'
      )
    );
  } else if (input.vault === undefined) {
    results.push(
      createUnknownCheck(
        'programdata.authority',
        'deployment',
        'Multisig vault address unavailable'
      )
    );
  } else if (pdata.upgradeAuthority !== input.vault) {
    results.push(
      createFailCheck(
        'programdata.authority',
        'deployment',
        input.vault,
        pdata.upgradeAuthority ?? 'none',
        'ProgramData upgrade authority does not match multisig vault'
      )
    );
  } else {
    results.push(createPassCheck('programdata.authority', 'deployment'));
  }

  // 4. deployment.slot
  if (pdata?.slot === undefined || input.manifestExpectedDeploymentSlot === undefined) {
    results.push(
      createUnknownCheck(
        'deployment.slot',
        'deployment',
        'ProgramData deployment slot or manifest expected slot unavailable'
      )
    );
  } else if (pdata.slot !== input.manifestExpectedDeploymentSlot) {
    results.push(
      createFailCheck(
        'deployment.slot',
        'deployment',
        input.manifestExpectedDeploymentSlot.toString(),
        pdata.slot.toString(),
        `Current ProgramData slot (${pdata.slot}) does not match expected slot (${input.manifestExpectedDeploymentSlot})`
      )
    );
  } else {
    results.push(createPassCheck('deployment.slot', 'deployment'));
  }

  // 5. programdata.capacity (notice only, non-blocking)
  const actualCapacity =
    pdata?.capacity !== undefined
      ? pdata.capacity
      : pdata?.rawData !== undefined && pdata.rawData.length >= PROGRAMDATA_HEADER_SIZE
        ? pdata.rawData.length - PROGRAMDATA_HEADER_SIZE
        : undefined;

  if (actualCapacity === undefined || input.artifactLength === undefined) {
    results.push(
      createUnknownCheck(
        'programdata.capacity',
        'deployment',
        'ProgramData capacity or artifact length unavailable',
        false // Notice check is non-blocking
      )
    );
  } else if (actualCapacity < input.artifactLength) {
    results.push(
      createNoticeCheck(
        'programdata.capacity',
        'deployment',
        'notice',
        `>= ${input.artifactLength}`,
        actualCapacity,
        `ProgramData capacity (${actualCapacity} bytes) is less than artifact length (${input.artifactLength} bytes)`
      )
    );
  } else {
    results.push(
      createNoticeCheck(
        'programdata.capacity',
        'deployment',
        'pass',
        `>= ${input.artifactLength}`,
        actualCapacity
      )
    );
  }

  return results;
}
