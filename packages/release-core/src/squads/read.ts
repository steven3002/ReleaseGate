import type { ChainReader, GetAccountsOptions } from '../chain/chain-reader';
import { deriveProposalPda } from './addresses';
import { decodeMultisigAccount } from './multisig';
import type { MultisigAccount } from './multisig';
import { decodeProposalAccount } from './proposal';
import type { ProposalAccount } from './proposal';

export interface MultisigSnapshot {
  readonly address: string;
  readonly multisig: MultisigAccount;
  readonly contextSlot: number;
}

export interface ProposalSnapshot {
  readonly address: string;
  readonly proposal: ProposalAccount;
  readonly contextSlot: number;
}

export async function readMultisig(
  chain: ChainReader,
  multisigAddress: string,
  options?: GetAccountsOptions
): Promise<MultisigSnapshot | null> {
  const res = await chain.getAccounts([multisigAddress], options);
  const snapshot = res.accounts[0];
  if (!snapshot) {
    return null;
  }
  const decoded = decodeMultisigAccount(snapshot.data);
  if (!decoded.ok) {
    return null;
  }
  return {
    address: multisigAddress,
    multisig: decoded.value,
    contextSlot: res.contextSlot,
  };
}

export async function readProposal(
  chain: ChainReader,
  multisigAddress: string,
  transactionIndex: bigint,
  options?: GetAccountsOptions
): Promise<ProposalSnapshot | null> {
  const proposalAddress = deriveProposalPda(multisigAddress, transactionIndex).address;
  const res = await chain.getAccounts([proposalAddress], options);
  const snapshot = res.accounts[0];
  if (!snapshot) {
    return null;
  }
  const decoded = decodeProposalAccount(snapshot.data);
  if (!decoded.ok) {
    return null;
  }
  return {
    address: proposalAddress,
    proposal: decoded.value,
    contextSlot: res.contextSlot,
  };
}

export async function readProposalRange(
  chain: ChainReader,
  multisigAddress: string,
  fromIndex: bigint,
  toIndex: bigint,
  options?: GetAccountsOptions
): Promise<ProposalSnapshot[]> {
  if (fromIndex > toIndex) {
    return [];
  }
  const indexes: bigint[] = [];
  for (let i = fromIndex; i <= toIndex; i++) {
    indexes.push(i);
  }
  const addresses = indexes.map(idx => deriveProposalPda(multisigAddress, idx).address);
  const res = await chain.getAccounts(addresses, options);

  const results: ProposalSnapshot[] = [];
  res.accounts.forEach((snapshot, i) => {
    if (!snapshot) return;
    const decoded = decodeProposalAccount(snapshot.data);
    if (!decoded.ok) return;
    const addr = addresses[i] ?? '';
    results.push({
      address: addr,
      proposal: decoded.value,
      contextSlot: res.contextSlot,
    });
  });

  return results;
}
