import type { DeploymentReceipt } from 'release-core';
import {
  getDocument,
  setDocument,
  listDocuments,
} from '../../../platform/storage';

const RECEIPTS_COLLECTION = 'receipts';

export async function saveReceipt(receipt: DeploymentReceipt): Promise<void> {
  await setDocument(RECEIPTS_COLLECTION, receipt.id, receipt);
}

export async function getReceipt(id: string): Promise<DeploymentReceipt | null> {
  return await getDocument<DeploymentReceipt>(RECEIPTS_COLLECTION, id);
}

export async function listReceipts(): Promise<DeploymentReceipt[]> {
  const receipts = await listDocuments<DeploymentReceipt>(RECEIPTS_COLLECTION);
  return receipts.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function getReceiptForProposal(
  multisig: string,
  transactionIndex: bigint
): Promise<DeploymentReceipt | null> {
  const receipts = await listReceipts();
  return (
    receipts.find(
      (r) =>
        r.multisig === multisig &&
        BigInt(r.transactionIndex) === transactionIndex
    ) ?? null
  );
}
