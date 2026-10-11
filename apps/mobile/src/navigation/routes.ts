export type RootStackParamList = {
  WorkspaceHome: undefined;
  WorkspaceSetup: undefined;
  ReleaseImport: undefined;
  ReleaseDetail: { releaseId: string };
  ProposalReview: { proposalIndex: string };
  CreateGuardedProposal: {
    initialReleaseId?: string | undefined;
    initialBuffer?: string | undefined;
    replacementForIndex?: string | undefined;
  };
  DeploymentReceipt: {
    receiptId?: string | undefined;
    multisig?: string | undefined;
    transactionIndex?: string | undefined;
  };
};
