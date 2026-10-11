import { Connection, PublicKey } from '@solana/web3.js';
import type { GetMultipleAccountsConfig } from '@solana/web3.js';
import type {
  AccountSnapshot,
  ChainCommitment,
  ChainReader,
  GetAccountsOptions,
  SignatureStatusSnapshot,
  TransactionOutcome,
} from './chain-reader';

export class Web3ChainReader implements ChainReader {
  constructor(private readonly connection: Connection) {}

  async getGenesisHash(): Promise<string> {
    return this.connection.getGenesisHash();
  }

  async getAccounts(
    addresses: string[],
    options?: GetAccountsOptions
  ): Promise<{ contextSlot: number; accounts: (AccountSnapshot | null)[] }> {
    if (addresses.length === 0) {
      return { contextSlot: 0, accounts: [] };
    }
    const publicKeys = addresses.map(addr => new PublicKey(addr));

    let config: GetMultipleAccountsConfig | undefined;
    if (options) {
      config = {};
      if (options.minContextSlot !== undefined) {
        config.minContextSlot = options.minContextSlot;
      }
      if (options.commitment !== undefined) {
        config.commitment = options.commitment;
      }
    }

    const res = await this.connection.getMultipleAccountsInfoAndContext(publicKeys, config);
    const accounts: (AccountSnapshot | null)[] = res.value.map((info, idx) => {
      if (!info) {
        return null;
      }
      const addr = addresses[idx] ?? '';
      const snapshot: AccountSnapshot = {
        address: addr,
        data: new Uint8Array(info.data.buffer, info.data.byteOffset, info.data.byteLength),
        owner: info.owner.toBase58(),
        lamports: BigInt(info.lamports),
        executable: info.executable,
        rentEpoch: info.rentEpoch !== undefined ? BigInt(info.rentEpoch) : undefined,
      };
      return snapshot;
    });

    return {
      contextSlot: res.context.slot,
      accounts,
    };
  }

  async getBlockHeight(commitment?: ChainCommitment): Promise<number> {
    return this.connection.getBlockHeight(commitment);
  }

  async getSignatureStatus(signature: string): Promise<SignatureStatusSnapshot | null> {
    const res = await this.connection.getSignatureStatus(signature, {
      searchTransactionHistory: true,
    });
    if (!res || !res.value) {
      return null;
    }
    const snapshot: SignatureStatusSnapshot = {
      slot: res.context.slot,
      confirmations: res.value.confirmations,
      err: res.value.err,
      confirmationStatus: res.value.confirmationStatus,
    };
    return snapshot;
  }

  async getTransactionOutcome(signature: string): Promise<TransactionOutcome | null> {
    const res = await this.connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });
    if (!res) {
      return null;
    }
    return {
      slot: res.slot,
      error: res.meta?.err ?? null,
      logs: res.meta?.logMessages ?? [],
    };
  }
}
