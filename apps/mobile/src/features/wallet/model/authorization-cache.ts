import { getDocument, setDocument, deleteDocument } from '../../../platform/storage';
import type { WalletAuthorization } from '../types';

const COLLECTION = 'wallet-authorization';

export async function getCachedAuthorization(
  clusterId: string
): Promise<WalletAuthorization | null> {
  return await getDocument<WalletAuthorization>(COLLECTION, clusterId);
}

export async function saveCachedAuthorization(
  authorization: WalletAuthorization
): Promise<void> {
  await setDocument(COLLECTION, authorization.clusterId, authorization);
}

export async function clearCachedAuthorization(
  clusterId: string
): Promise<void> {
  await deleteDocument(COLLECTION, clusterId);
}
