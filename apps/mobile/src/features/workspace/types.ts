import type {
  ClusterId,
  MultisigSnapshot,
  MemberCapabilities,
  ProposalAccount,
} from 'release-core';

export interface Workspace {
  id: string;
  clusterId: ClusterId;
  rpcUrl: string;
  multisig: string;
  member?: string | undefined;
  label?: string | undefined;
  createdAt: string;
}

export interface WorkspaceValidationResult {
  ok: boolean;
  error?: string | undefined;
  snapshot?: MultisigSnapshot | undefined;
  capabilities?: MemberCapabilities | undefined;
}

export interface WorkspaceProposalItem {
  readonly address: string;
  readonly proposal: ProposalAccount;
  readonly contextSlot: number;
}

export interface WorkspaceProposalsResult {
  proposals: WorkspaceProposalItem[];
  contextSlot: number;
}
