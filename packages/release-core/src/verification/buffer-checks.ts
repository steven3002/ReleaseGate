import { LOADER_V3_PROGRAM_ID } from '../cluster/programs';
import { LOADER_STATE_BUFFER } from '../loader-v3/layout';
import {
  createFailCheck,
  createPassCheck,
  createUnknownCheck,
  type CheckResult,
} from './check';

export interface BufferCheckInput {
  readonly buffer?: {
    readonly owner: string;
    readonly stateTag?: number | undefined;
    readonly authority?: string | null | undefined;
    readonly payload?: Uint8Array | undefined;
    readonly rawData?: Uint8Array | undefined;
  } | undefined;
  readonly vault?: string | undefined;
  readonly artifactLength?: number | undefined;
  readonly artifactBytes?: Uint8Array | undefined;
}

export function runBufferChecks(input: BufferCheckInput): CheckResult[] {
  const results: CheckResult[] = [];
  const buf = input.buffer;

  // 1. buffer.owner
  if (!buf) {
    results.push(
      createUnknownCheck(
        'buffer.owner',
        'buffer',
        'Buffer account data unavailable'
      )
    );
  } else if (buf.owner !== LOADER_V3_PROGRAM_ID) {
    results.push(
      createFailCheck(
        'buffer.owner',
        'buffer',
        LOADER_V3_PROGRAM_ID,
        buf.owner,
        `Buffer owner is ${buf.owner}, expected loader ${LOADER_V3_PROGRAM_ID}`
      )
    );
  } else {
    results.push(createPassCheck('buffer.owner', 'buffer'));
  }

  // 2. buffer.state
  if (!buf) {
    results.push(
      createUnknownCheck(
        'buffer.state',
        'buffer',
        'Buffer account data unavailable'
      )
    );
  } else {
    const isBufferState =
      buf.stateTag !== undefined
        ? buf.stateTag === LOADER_STATE_BUFFER
        : buf.rawData !== undefined && buf.rawData.length >= 4
          ? new DataView(
              buf.rawData.buffer,
              buf.rawData.byteOffset,
              buf.rawData.byteLength
            ).getUint32(0, true) === LOADER_STATE_BUFFER
          : buf.payload !== undefined;

    if (!isBufferState) {
      results.push(
        createFailCheck(
          'buffer.state',
          'buffer',
          'Buffer (variant 1)',
          buf.stateTag !== undefined ? `variant ${buf.stateTag}` : 'uninitialized/unknown',
          'Buffer account is not in Buffer state'
        )
      );
    } else {
      results.push(createPassCheck('buffer.state', 'buffer'));
    }
  }

  // 3. buffer.authority
  if (!buf) {
    results.push(
      createUnknownCheck(
        'buffer.authority',
        'buffer',
        'Buffer account data unavailable'
      )
    );
  } else if (input.vault === undefined) {
    results.push(
      createUnknownCheck(
        'buffer.authority',
        'buffer',
        'Multisig vault address unavailable'
      )
    );
  } else if (buf.authority !== input.vault) {
    results.push(
      createFailCheck(
        'buffer.authority',
        'buffer',
        input.vault,
        buf.authority ?? 'none',
        'Buffer authority does not match multisig vault'
      )
    );
  } else {
    results.push(createPassCheck('buffer.authority', 'buffer'));
  }

  // 4. buffer.length
  if (!buf?.payload || input.artifactLength === undefined) {
    results.push(
      createUnknownCheck(
        'buffer.length',
        'buffer',
        'Buffer payload or artifact length unavailable'
      )
    );
  } else if (buf.payload.length !== input.artifactLength) {
    const actualLen = buf.payload.length;
    const expectedLen = input.artifactLength;
    if (actualLen > expectedLen) {
      const extraCount = actualLen - expectedLen;
      const extraBytes = buf.payload.subarray(expectedLen);
      const allZero = extraBytes.every(b => b === 0);
      const detail = allZero
        ? `Extra ${extraCount} byte(s) (zero padding)`
        : `Extra ${extraCount} byte(s) (non-zero trailing data)`;
      results.push(
        createFailCheck(
          'buffer.length',
          'buffer',
          expectedLen,
          actualLen,
          detail
        )
      );
    } else {
      const missingCount = expectedLen - actualLen;
      results.push(
        createFailCheck(
          'buffer.length',
          'buffer',
          expectedLen,
          actualLen,
          `Missing ${missingCount} byte(s)`
        )
      );
    }
  } else {
    results.push(createPassCheck('buffer.length', 'buffer'));
  }

  // 5. buffer.bytes
  if (!buf?.payload || !input.artifactBytes) {
    results.push(
      createUnknownCheck(
        'buffer.bytes',
        'buffer',
        'Buffer payload or artifact bytes unavailable'
      )
    );
  } else {
    const minLen = Math.min(buf.payload.length, input.artifactBytes.length);
    let diffOffset = -1;
    for (let i = 0; i < minLen; i++) {
      if (buf.payload[i] !== input.artifactBytes[i]) {
        diffOffset = i;
        break;
      }
    }

    if (diffOffset !== -1) {
      const expectedByte = input.artifactBytes[diffOffset]!.toString(16).padStart(2, '0');
      const actualByte = buf.payload[diffOffset]!.toString(16).padStart(2, '0');
      results.push(
        createFailCheck(
          'buffer.bytes',
          'buffer',
          `offset ${diffOffset}: 0x${expectedByte}`,
          `offset ${diffOffset}: 0x${actualByte}`,
          `First differing byte at offset ${diffOffset} (expected 0x${expectedByte}, actual 0x${actualByte})`
        )
      );
    } else if (buf.payload.length !== input.artifactBytes.length) {
      results.push(
        createFailCheck(
          'buffer.bytes',
          'buffer',
          `length ${input.artifactBytes.length}`,
          `length ${buf.payload.length}`,
          `Bytes match up to offset ${minLen}, but payload length differs`
        )
      );
    } else {
      results.push(createPassCheck('buffer.bytes', 'buffer'));
    }
  }

  return results;
}
