import { readProposal, type ProposalInspection } from 'release-core';
import { getOrCreateChainReader } from '../../../platform/rpc';

export async function fetchProposalInspection(
  rpcUrl: string,
  multisig: string,
  transactionIndex: bigint
): Promise<ProposalInspection> {
  const chainReader = getOrCreateChainReader(rpcUrl);
  return await readProposal(chainReader, { multisig, transactionIndex });
}
