import type {
  AccountSnapshot,
  ChainCommitment,
  ChainReader,
  TransactionOutcome,
} from '../chain/chain-reader';
import { deriveProgramDataAddress } from '../loader-v3/program-data-address';

export interface ReadDeploymentInput {
  readonly chain: ChainReader;
  readonly program: string;
  readonly bufferAddress: string;
  readonly signature?: string | undefined;
  readonly commitment?: ChainCommitment | undefined;
}

export interface DeploymentState {
  readonly programAddress: string;
  readonly programDataAddress: string;
  readonly bufferAddress: string;
  readonly programAccount: AccountSnapshot | null;
  readonly programDataAccount: AccountSnapshot | null;
  readonly bufferAccount: AccountSnapshot | null;
  readonly transactionOutcome: TransactionOutcome | null;
  readonly contextSlot: number;
}

export async function readDeploymentState(
  input: ReadDeploymentInput
): Promise<DeploymentState> {
  const { chain, program, bufferAddress, signature, commitment } = input;
  const programDataAddress = deriveProgramDataAddress(program);

  let transactionOutcome: TransactionOutcome | null = null;
  if (signature) {
    try {
      transactionOutcome = await chain.getTransactionOutcome(signature, commitment);
    } catch {
      transactionOutcome = null;
    }
  }

  const { contextSlot, accounts } = await chain.getAccounts(
    [program, programDataAddress, bufferAddress],
    { commitment }
  );

  const programAccount = accounts[0] ?? null;
  const programDataAccount = accounts[1] ?? null;
  const bufferAccount = accounts[2] ?? null;

  return {
    programAddress: program,
    programDataAddress,
    bufferAddress,
    programAccount,
    programDataAccount,
    bufferAccount,
    transactionOutcome,
    contextSlot,
  };
}
