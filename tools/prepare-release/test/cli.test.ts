import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));

function runCli(...args: string[]) {
  return spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...args], {
    cwd: packageRoot,
    encoding: 'utf8',
  });
}

describe('prepare-release', () => {
  it('prints the command list when called without a command', () => {
    const result = runCli();
    assert.equal(result.status, 0);
    assert.match(result.stdout, /^Usage: prepare-release <command> \[options\]/);
    for (const name of ['manifest', 'buffer', 'propose', 'inspect', 'vote', 'execute', 'receipt']) {
      assert.match(result.stdout, new RegExp(`^  ${name}\\s`, 'm'));
    }
  });

  it('prints the same list for --help', () => {
    assert.equal(runCli('--help').stdout, runCli().stdout);
  });

  it('exits non-zero for an unknown command and names it', () => {
    const result = runCli('deploy-everything');
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /unknown command "deploy-everything"/);
    assert.match(result.stderr, /Commands:/);
  });
});
