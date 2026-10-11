export interface AccountSnapshot {
  readonly address: string;
  readonly data: Uint8Array;
  readonly owner: string;
  readonly lamports: bigint;
  readonly executable: boolean;
  readonly rentEpoch?: bigint | undefined;
}

export type ChainCommitment = 'processed' | 'confirmed' | 'finalized';

export interface GetAccountsOptions {
  readonly minContextSlot?: number | undefined;
  readonly commitment?: ChainCommitment | undefined;
}

export interface SignatureStatusSnapshot {
  readonly slot: number;
  readonly confirmations: number | null;
  readonly err: unknown | null;
  readonly confirmationStatus?: 'processed' | 'confirmed' | 'finalized' | undefined;
}

export interface TransactionOutcome {
  readonly slot: number;
  readonly error: unknown | null;
  readonly logs: string[];
}

export interface ChainReader {
  getGenesisHash(): Promise<string>;
  getAccounts(
    addresses: string[],
    options?: GetAccountsOptions
  ): Promise<{ contextSlot: number; accounts: (AccountSnapshot | null)[] }>;
  getBlockHeight(commitment?: ChainCommitment): Promise<number>;
  getSignatureStatus(signature: string): Promise<SignatureStatusSnapshot | null>;
  getTransactionOutcome(signature: string): Promise<TransactionOutcome | null>;
}
