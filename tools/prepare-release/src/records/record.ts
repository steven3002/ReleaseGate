import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface EvidenceRecord {
  readonly command: string;
  readonly timestamp: string;
  readonly cluster: string;
  readonly genesisHash: string;
  readonly inputs: Record<string, unknown>;
  readonly addresses: Record<string, string>;
  readonly signatures: readonly string[];
  readonly slots: Record<string, number>;
  readonly outcome: 'success' | 'failure';
  readonly result?: Record<string, unknown> | undefined;
  readonly error?: string | undefined;
  readonly logs?: readonly string[] | undefined;
}

export function serializeRecord(record: EvidenceRecord): string {
  return JSON.stringify(
    record,
    (_key, value: unknown) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    },
    2,
  );
}

export async function writeEvidenceRecord(filePath: string, record: EvidenceRecord): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const content = serializeRecord(record);
  await fs.writeFile(filePath, `${content}\n`, 'utf8');
}
