import type { Operation } from 'release-core';
import {
  getDocument,
  setDocument,
  listDocuments,
  deleteDocument,
} from '../../../platform/storage';
import type { OperationJournal } from './types';

const OPERATIONS_COLLECTION = 'operations';

export async function saveOperation(operation: Operation): Promise<void> {
  await setDocument(OPERATIONS_COLLECTION, operation.id, operation);
}

export async function getOperation(id: string): Promise<Operation | null> {
  return await getDocument<Operation>(OPERATIONS_COLLECTION, id);
}

export async function listOperations(): Promise<Operation[]> {
  const ops = await listDocuments<Operation>(OPERATIONS_COLLECTION);
  return ops.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function removeOperation(id: string): Promise<void> {
  await deleteDocument(OPERATIONS_COLLECTION, id);
}

export const documentStoreJournal: OperationJournal = {
  saveOperation,
  getOperation,
  listOperations,
  removeOperation,
};
