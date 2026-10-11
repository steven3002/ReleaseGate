import { PublicKey } from '@solana/web3.js';
import type {
  ClusterId,
  MultisigSnapshot,
  MemberCapabilities,
} from 'release-core';
import {
  matchesClusterGenesis,
  SQUADS_PROGRAM_ID,
  decodeMultisigAccount,
  getMemberCapabilities,
  readProposalRange,
} from 'release-core';
import { getOrCreateChainReader } from '../../../platform/rpc';
import type {
  WorkspaceValidationResult,
  WorkspaceProposalsResult,
} from '../types';

export async function validateEndpoint(
  clusterId: ClusterId,
  rpcUrl: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const reader = getOrCreateChainReader(rpcUrl);
    const genesisHash = await reader.getGenesisHash();
    if (!matchesClusterGenesis(clusterId, genesisHash)) {
      return {
        ok: false,
        error: `This endpoint is not ${clusterId}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to connect to endpoint: ${String(err)}`,
    };
  }
}

export async function loadAndValidateMultisig(
  rpcUrl: string,
  multisigAddress: string,
  memberAddress?: string
): Promise<WorkspaceValidationResult> {
  try {
    new PublicKey(multisigAddress);
  } catch {
    return {
      ok: false,
      error: 'This address is not a Squads multisig',
    };
  }

  try {
    const reader = getOrCreateChainReader(rpcUrl);
    const res = await reader.getAccounts([multisigAddress]);
    const account = res.accounts[0];

    if (!account) {
      return {
        ok: false,
        error: 'This address is not a Squads multisig',
      };
    }

    if (account.owner !== SQUADS_PROGRAM_ID) {
      return {
        ok: false,
        error: 'This address is not a Squads multisig',
      };
    }

    const decoded = decodeMultisigAccount(account.data);
    if (!decoded.ok) {
      return {
        ok: false,
        error: 'This address is not a Squads multisig',
      };
    }

    const snapshot: MultisigSnapshot = {
      address: multisigAddress,
      createKey: decoded.value.createKey,
      configAuthority: decoded.value.configAuthority,
      threshold: decoded.value.threshold,
      timeLockSeconds: decoded.value.timeLockSeconds,
      transactionIndex: decoded.value.transactionIndex,
      staleTransactionIndex: decoded.value.staleTransactionIndex,
      members: decoded.value.members,
      contextSlot: res.contextSlot,
    };

    let capabilities: MemberCapabilities = {
      isMember: false,
      initiate: false,
      vote: false,
      execute: false,
    };

    if (memberAddress) {
      capabilities = getMemberCapabilities(decoded.value.members, memberAddress);
    }

    return {
      ok: true,
      snapshot,
      capabilities,
    };
  } catch {
    return {
      ok: false,
      error: 'This address is not a Squads multisig',
    };
  }
}

export async function fetchWorkspaceProposals(
  rpcUrl: string,
  multisigAddress: string,
  transactionIndex: bigint
): Promise<WorkspaceProposalsResult> {
  if (transactionIndex === 0n) {
    return { proposals: [], contextSlot: 0 };
  }

  const reader = getOrCreateChainReader(rpcUrl);
  const fromIndex = transactionIndex > 20n ? transactionIndex - 19n : 1n;
  const proposals = await readProposalRange(
    reader,
    multisigAddress,
    fromIndex,
    transactionIndex
  );

  // Newest index first
  const sorted = [...proposals].sort((a, b) => {
    const diff = b.proposal.transactionIndex - a.proposal.transactionIndex;
    return diff > 0n ? 1 : diff < 0n ? -1 : 0;
  });

  const contextSlot = proposals[0]?.contextSlot ?? 0;
  return { proposals: sorted, contextSlot };
}
