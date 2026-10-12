import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function getSolanaCliPath(): string {
  if (process.env.RG_SOLANA_BIN) {
    return `${process.env.RG_SOLANA_BIN}/solana`;
  }
  return 'solana';
}

export interface CliCommandResult {
  readonly stdout: string;
  readonly stderr: string;
}

export async function cliDeployProgram(params: {
  readonly programFilepath: string;
  readonly programKeypair: string;
  readonly url: string;
  readonly keypair: string;
  readonly maxLen?: number | undefined;
  readonly upgradeAuthority?: string | undefined;
}): Promise<CliCommandResult> {
  const args = [
    'program',
    'deploy',
    params.programFilepath,
    '--program-id',
    params.programKeypair,
    '--url',
    params.url,
    '--keypair',
    params.keypair,
    '--use-rpc',
  ];
  if (params.maxLen !== undefined) {
    args.push('--max-len', params.maxLen.toString());
  }
  if (params.upgradeAuthority !== undefined) {
    args.push('--upgrade-authority', params.upgradeAuthority);
  }
  return execFileAsync(getSolanaCliPath(), args);
}

export async function cliWriteBuffer(params: {
  readonly programFilepath: string;
  readonly bufferKeypair: string;
  readonly url: string;
  readonly keypair: string;
}): Promise<CliCommandResult> {
  const args = [
    'program',
    'write-buffer',
    params.programFilepath,
    '--buffer',
    params.bufferKeypair,
    '--url',
    params.url,
    '--keypair',
    params.keypair,
    '--use-rpc',
  ];
  return execFileAsync(getSolanaCliPath(), args);
}

export async function cliSetBufferAuthority(params: {
  readonly bufferPubkey: string;
  readonly newAuthority: string;
  readonly url: string;
  readonly keypair: string;
}): Promise<CliCommandResult> {
  const args = [
    'program',
    'set-buffer-authority',
    params.bufferPubkey,
    '--new-buffer-authority',
    params.newAuthority,
    '--url',
    params.url,
    '--keypair',
    params.keypair,
  ];
  return execFileAsync(getSolanaCliPath(), args);
}

export async function cliSetUpgradeAuthority(params: {
  readonly programAddress: string;
  readonly newAuthority: string;
  readonly url: string;
  readonly keypair: string;
}): Promise<CliCommandResult> {
  const args = [
    'program',
    'set-upgrade-authority',
    params.programAddress,
    '--new-upgrade-authority',
    params.newAuthority,
    '--skip-new-upgrade-authority-signer-check',
    '--url',
    params.url,
    '--keypair',
    params.keypair,
  ];
  return execFileAsync(getSolanaCliPath(), args);
}

export async function cliShow(params: {
  readonly accountAddress: string;
  readonly url: string;
}): Promise<CliCommandResult> {
  const args = ['program', 'show', params.accountAddress, '--url', params.url, '--output', 'json'];
  return execFileAsync(getSolanaCliPath(), args);
}
