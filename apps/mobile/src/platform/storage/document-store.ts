import { Buffer } from 'buffer';
import * as FileSystem from 'expo-file-system/legacy';

function sanitizeKey(key: string): string {
  return encodeURIComponent(key).replace(/[*]/g, '_');
}

function getCollectionDir(collection: string): string {
  const base = FileSystem.documentDirectory || '';
  return `${base}documents/${collection}/`;
}

function getDocumentPath(collection: string, key: string): string {
  return `${getCollectionDir(collection)}${sanitizeKey(key)}.json`;
}

async function ensureDir(dirUri: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(dirUri);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
  }
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return { __type: 'bigint', value: value.toString() };
  }
  if (value instanceof Uint8Array) {
    return { __type: 'Uint8Array', hex: Buffer.from(value).toString('hex') };
  }
  return value;
}

function jsonReviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (obj.__type === 'bigint') {
      return BigInt((obj as { value: string }).value);
    }
    if (obj.__type === 'Uint8Array') {
      return new Uint8Array(Buffer.from((obj as { hex: string }).hex, 'hex'));
    }
  }
  return value;
}

export async function getDocument<T>(
  collection: string,
  key: string
): Promise<T | null> {
  const path = getDocumentPath(collection, key);
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    return null;
  }
  const content = await FileSystem.readAsStringAsync(path);
  return JSON.parse(content, jsonReviver) as T;
}

export async function setDocument<T>(
  collection: string,
  key: string,
  value: T
): Promise<void> {
  const dir = getCollectionDir(collection);
  await ensureDir(dir);

  const targetPath = getDocumentPath(collection, key);
  const tempPath = `${targetPath}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const serialized = JSON.stringify(value, jsonReplacer, 2);
  await FileSystem.writeAsStringAsync(tempPath, serialized);
  await FileSystem.moveAsync({
    from: tempPath,
    to: targetPath,
  });
}

export async function deleteDocument(
  collection: string,
  key: string
): Promise<void> {
  const path = getDocumentPath(collection, key);
  await FileSystem.deleteAsync(path, { idempotent: true });
}

export async function listDocuments<T>(collection: string): Promise<T[]> {
  const dir = getCollectionDir(collection);
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists || !info.isDirectory) {
    return [];
  }

  const entries = await FileSystem.readDirectoryAsync(dir);
  const documents: T[] = [];

  for (const entry of entries) {
    if (!entry.endsWith('.json') || entry.includes('.tmp.')) {
      continue;
    }
    const path = `${dir}${entry}`;
    try {
      const content = await FileSystem.readAsStringAsync(path);
      documents.push(JSON.parse(content, jsonReviver) as T);
    } catch {
      // Incomplete or concurrent write, skip
    }
  }

  return documents;
}
