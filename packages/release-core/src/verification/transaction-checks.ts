import type { GuardAssessment } from '../guard/assess';
import type { ClassifiedInstruction } from '../inspection/classify';
import { deriveTransactionPda } from '../squads/addresses';
import type { StoredTransaction } from '../squads/stored-transaction';
import {
  createFailCheck,
  createPassCheck,
  createUnknownCheck,
  type CheckResult,
} from './check';

export interface TransactionCheckInput {
  readonly storedTransaction?: StoredTransaction | undefined;
  readonly expectedMultisig: string;
  readonly expectedTransactionIndex: bigint;
  readonly guardAssessment?: GuardAssessment | undefined;
  readonly classifiedInstructions?: readonly ClassifiedInstruction[] | undefined;
  readonly artifactLength?: number | undefined;
  readonly artifactKeccak256?: string | undefined;
  readonly manifestExpectedDeploymentSlot?: bigint | undefined;
}

const CANONICAL_INSTRUCTION_KINDS = new Set([
  'assert-buffer-owner',
  'assert-buffer-length',
  'assert-buffer-hash',
  'assert-deployment-slot',
  'loader-upgrade',
]);

export function runTransactionChecks(input: TransactionCheckInput): CheckResult[] {
  const results: CheckResult[] = [];

  // 1. transaction.kind
  if (!input.storedTransaction) {
    results.push(
      createUnknownCheck(
        'transaction.kind',
        'transaction',
        'Stored transaction account unavailable'
      )
    );
  } else if (input.storedTransaction.kind !== 'vault') {
    results.push(
      createFailCheck(
        'transaction.kind',
        'transaction',
        'vault',
        input.storedTransaction.kind,
        `Expected VaultTransaction but found ${input.storedTransaction.kind}`
      )
    );
  } else {
    let expectedAddress = '';
    try {
      expectedAddress = deriveTransactionPda(
        input.expectedMultisig,
        input.expectedTransactionIndex
      ).address;
    } catch {
      expectedAddress = '';
    }

    if (expectedAddress && input.storedTransaction.address !== expectedAddress) {
      results.push(
        createFailCheck(
          'transaction.kind',
          'transaction',
          expectedAddress,
          input.storedTransaction.address,
          'Transaction account address does not match PDA derived from multisig and proposal index'
        )
      );
    } else {
      results.push(createPassCheck('transaction.kind', 'transaction'));
    }
  }

  // 2. transaction.resolved
  if (!input.storedTransaction) {
    results.push(
      createUnknownCheck(
        'transaction.resolved',
        'transaction',
        'Stored transaction account unavailable'
      )
    );
  } else if (input.storedTransaction.lookupTableCount > 0) {
    results.push(
      createFailCheck(
        'transaction.resolved',
        'transaction',
        0,
        input.storedTransaction.lookupTableCount,
        'Address lookup tables inside stored transaction are unsupported'
      )
    );
  } else if ((input.storedTransaction.ephemeralSignerCount ?? 0) > 0) {
    results.push(
      createFailCheck(
        'transaction.resolved',
        'transaction',
        0,
        input.storedTransaction.ephemeralSignerCount,
        'Ephemeral signers inside stored transaction are unsupported'
      )
    );
  } else {
    const hasUnresolvedFindings = input.guardAssessment?.findings.some(f =>
      f.toLowerCase().includes('unused account key') ||
      f.toLowerCase().includes('out-of-bounds')
    );
    if (hasUnresolvedFindings) {
      results.push(
        createFailCheck(
          'transaction.resolved',
          'transaction',
          'fully-resolved-keys',
          input.guardAssessment?.findings.join('; '),
          'Transaction contains unresolved or unused account keys'
        )
      );
    } else {
      results.push(createPassCheck('transaction.resolved', 'transaction'));
    }
  }

  // 3. transaction.supported
  if (!input.classifiedInstructions || input.classifiedInstructions.length === 0) {
    results.push(
      createUnknownCheck(
        'transaction.supported',
        'transaction',
        'Classified instructions unavailable'
      )
    );
  } else {
    const unsupportedInstructions = input.classifiedInstructions.filter(
      ix => !CANONICAL_INSTRUCTION_KINDS.has(ix.kind)
    );
    if (unsupportedInstructions.length > 0) {
      results.push(
        createFailCheck(
          'transaction.supported',
          'transaction',
          'only canonical 5 instructions',
          unsupportedInstructions.map(ix => ix.kind).join(', '),
          `Transaction contains ${unsupportedInstructions.length} unsupported instruction(s)`
        )
      );
    } else {
      results.push(createPassCheck('transaction.supported', 'transaction'));
    }
  }

  // 4. guard.complete
  if (!input.guardAssessment) {
    results.push(
      createUnknownCheck(
        'guard.complete',
        'transaction',
        'Guard assessment unavailable'
      )
    );
  } else if (input.guardAssessment.shape !== 'guarded-upgrade') {
    results.push(
      createFailCheck(
        'guard.complete',
        'transaction',
        'guarded-upgrade',
        input.guardAssessment.shape,
        `Guard shape is ${input.guardAssessment.shape}`
      )
    );
  } else {
    results.push(createPassCheck('guard.complete', 'transaction'));
  }

  // 5. guard.length
  if (
    input.guardAssessment?.params?.payloadLength === undefined ||
    input.artifactLength === undefined
  ) {
    results.push(
      createUnknownCheck(
        'guard.length',
        'transaction',
        'Guard payload length or artifact length unavailable'
      )
    );
  } else {
    const expectedGuardLength = 37n + BigInt(input.artifactLength);
    const actualGuardLength = 37n + input.guardAssessment.params.payloadLength;
    if (actualGuardLength !== expectedGuardLength) {
      results.push(
        createFailCheck(
          'guard.length',
          'transaction',
          expectedGuardLength.toString(),
          actualGuardLength.toString(),
          `Guard asserts length ${actualGuardLength}, expected ${expectedGuardLength}`
        )
      );
    } else {
      results.push(createPassCheck('guard.length', 'transaction'));
    }
  }

  // 6. guard.hash
  if (
    input.guardAssessment?.params?.keccak256 === undefined ||
    input.artifactKeccak256 === undefined
  ) {
    results.push(
      createUnknownCheck(
        'guard.hash',
        'transaction',
        'Guard hash or artifact Keccak-256 unavailable'
      )
    );
  } else if (
    input.guardAssessment.params.keccak256.toLowerCase() !==
    input.artifactKeccak256.toLowerCase()
  ) {
    results.push(
      createFailCheck(
        'guard.hash',
        'transaction',
        input.artifactKeccak256.toLowerCase(),
        input.guardAssessment.params.keccak256.toLowerCase(),
        'Guard hash assertion does not match artifact Keccak-256'
      )
    );
  } else {
    // Also verify start offset 37 if classified instructions are present
    const hashIx = input.classifiedInstructions?.find(
      ix => ix.kind === 'assert-buffer-hash'
    );
    if (hashIx && hashIx.kind === 'assert-buffer-hash' && hashIx.start !== 37n) {
      results.push(
        createFailCheck(
          'guard.hash',
          'transaction',
          '37',
          hashIx.start.toString(),
          'Guard hash assertion does not start at buffer payload offset 37'
        )
      );
    } else {
      results.push(createPassCheck('guard.hash', 'transaction'));
    }
  }

  // 7. guard.slot
  if (
    input.guardAssessment?.params?.deploymentSlot === undefined ||
    input.manifestExpectedDeploymentSlot === undefined
  ) {
    results.push(
      createUnknownCheck(
        'guard.slot',
        'transaction',
        'Guard deployment slot or manifest expected slot unavailable'
      )
    );
  } else if (
    input.guardAssessment.params.deploymentSlot !==
    input.manifestExpectedDeploymentSlot
  ) {
    results.push(
      createFailCheck(
        'guard.slot',
        'transaction',
        input.manifestExpectedDeploymentSlot.toString(),
        input.guardAssessment.params.deploymentSlot.toString(),
        'Guard deployment slot does not match manifest expectedDeploymentSlot'
      )
    );
  } else {
    results.push(createPassCheck('guard.slot', 'transaction'));
  }

  return results;
}
