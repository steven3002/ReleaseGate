import * as FileSystem from 'expo-file-system/legacy';
import { File } from 'expo-file-system';
import { sha256 } from 'release-core';

function getBlobsDir(): string {
  const base = FileSystem.documentDirectory || '';
  return `${base}blobs/`;
}

function getBlobPath(sha256Hex: string): string {
  return `${getBlobsDir()}${sha256Hex.toLowerCase()}.bin`;
}

async function ensureDir(dirUri: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(dirUri);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
  }
}

export async function hasBlob(sha256Hex: string): Promise<boolean> {
  const path = getBlobPath(sha256Hex);
  const info = await FileSystem.getInfoAsync(path);
  return info.exists;
}

export async function getBlob(sha256Hex: string): Promise<Uint8Array | null> {
  const path = getBlobPath(sha256Hex);
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    return null;
  }

  try {
    const file = new File(path);
    return await file.bytes();
  } catch {
    const base64 = await FileSystem.readAsStringAsync(path, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
}

export async function putBlob(
  bytes: Uint8Array,
  expectedSha256Hex?: string
): Promise<{ sha256: string; path: string }> {
  const computedHash = sha256(bytes);
  if (expectedSha256Hex && computedHash.toLowerCase() !== expectedSha256Hex.toLowerCase()) {
    throw new Error(
      `Blob SHA-256 mismatch: expected ${expectedSha256Hex}, computed ${computedHash}`
    );
  }

  const dir = getBlobsDir();
  await ensureDir(dir);

  const targetPath = getBlobPath(computedHash);
  const targetInfo = await FileSystem.getInfoAsync(targetPath);
  if (targetInfo.exists) {
    return { sha256: computedHash, path: targetPath };
  }

  const tempPath = `${targetPath}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const base64Data = Buffer.from(bytes).toString('base64');
  await FileSystem.writeAsStringAsync(tempPath, base64Data, {
    encoding: FileSystem.EncodingType.Base64,
  });

  await FileSystem.moveAsync({
    from: tempPath,
    to: targetPath,
  });

  return { sha256: computedHash, path: targetPath };
}
