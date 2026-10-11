import { CLUSTERS, type ClusterId } from '../cluster/clusters';
import { deriveVaultPda } from '../squads/addresses';
import {
  createFailCheck,
  createPassCheck,
  createUnknownCheck,
  type CheckResult,
} from './check';

export interface IdentityCheckInput {
  readonly workspaceClusterId: ClusterId;
  readonly workspaceMultisig: string;
  readonly rpcGenesisHash?: string | undefined;
  readonly manifestClusterGenesisHash?: string | undefined;
  readonly manifestMultisig?: string | undefined;
  readonly manifestVault?: string | undefined;
  readonly manifestVaultIndex?: number | undefined;
  readonly storedTransactionVault?: string | undefined;
  readonly manifestProgram?: string | undefined;
  readonly upgradeProgram?: string | undefined;
}

export function runIdentityChecks(input: IdentityCheckInput): CheckResult[] {
  const results: CheckResult[] = [];
  const expectedGenesis = CLUSTERS[input.workspaceClusterId]?.genesisHash;

  // 1. cluster.genesis
  if (input.rpcGenesisHash === undefined) {
    results.push(
      createUnknownCheck(
        'cluster.genesis',
        'identity',
        'RPC genesis hash unavailable'
      )
    );
  } else if (!expectedGenesis) {
    results.push(
      createFailCheck(
        'cluster.genesis',
        'identity',
        'known-cluster-genesis',
        input.rpcGenesisHash,
        `Unrecognized cluster ${input.workspaceClusterId}`
      )
    );
  } else if (input.rpcGenesisHash !== expectedGenesis) {
    results.push(
      createFailCheck(
        'cluster.genesis',
        'identity',
        expectedGenesis,
        input.rpcGenesisHash,
        `Connected RPC genesis hash does not match ${input.workspaceClusterId}`
      )
    );
  } else {
    results.push(createPassCheck('cluster.genesis', 'identity'));
  }

  // 2. manifest.cluster
  if (input.manifestClusterGenesisHash === undefined) {
    results.push(
      createUnknownCheck(
        'manifest.cluster',
        'identity',
        'Manifest cluster genesis hash unavailable'
      )
    );
  } else if (input.manifestClusterGenesisHash !== expectedGenesis) {
    results.push(
      createFailCheck(
        'manifest.cluster',
        'identity',
        expectedGenesis,
        input.manifestClusterGenesisHash,
        `Manifest cluster does not match ${input.workspaceClusterId}`
      )
    );
  } else {
    results.push(createPassCheck('manifest.cluster', 'identity'));
  }

  // 3. manifest.multisig
  if (input.manifestMultisig === undefined) {
    results.push(
      createUnknownCheck(
        'manifest.multisig',
        'identity',
        'Manifest multisig address unavailable'
      )
    );
  } else if (input.manifestMultisig !== input.workspaceMultisig) {
    results.push(
      createFailCheck(
        'manifest.multisig',
        'identity',
        input.workspaceMultisig,
        input.manifestMultisig,
        'Manifest multisig address does not match workspace multisig'
      )
    );
  } else {
    results.push(createPassCheck('manifest.multisig', 'identity'));
  }

  // 4. manifest.vault
  if (
    input.manifestVault === undefined ||
    input.manifestVaultIndex === undefined
  ) {
    results.push(
      createUnknownCheck(
        'manifest.vault',
        'identity',
        'Manifest vault or vaultIndex unavailable'
      )
    );
  } else {
    let derivedVault: string;
    try {
      derivedVault = deriveVaultPda(
        input.workspaceMultisig,
        input.manifestVaultIndex
      ).address;
    } catch (err: unknown) {
      derivedVault = '';
    }

    if (!derivedVault || input.manifestVault !== derivedVault) {
      results.push(
        createFailCheck(
          'manifest.vault',
          'identity',
          derivedVault,
          input.manifestVault,
          'Manifest vault does not match vault derived from multisig and vaultIndex'
        )
      );
    } else if (
      input.storedTransactionVault !== undefined &&
      input.storedTransactionVault !== derivedVault
    ) {
      results.push(
        createFailCheck(
          'manifest.vault',
          'identity',
          derivedVault,
          input.storedTransactionVault,
          'Stored transaction vault does not match derived multisig vault'
        )
      );
    } else {
      results.push(createPassCheck('manifest.vault', 'identity'));
    }
  }

  // 5. manifest.program
  if (input.manifestProgram === undefined) {
    results.push(
      createUnknownCheck(
        'manifest.program',
        'identity',
        'Manifest program unavailable'
      )
    );
  } else if (input.upgradeProgram === undefined) {
    results.push(
      createUnknownCheck(
        'manifest.program',
        'identity',
        'Upgrade target program unavailable from transaction'
      )
    );
  } else if (input.manifestProgram !== input.upgradeProgram) {
    results.push(
      createFailCheck(
        'manifest.program',
        'identity',
        input.upgradeProgram,
        input.manifestProgram,
        'Manifest program does not match Upgrade instruction target program'
      )
    );
  } else {
    results.push(createPassCheck('manifest.program', 'identity'));
  }

  return results;
}
