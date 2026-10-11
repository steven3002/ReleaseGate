import process from 'node:process';

import { handleManifest } from './commands/manifest';
import { handleBuffer } from './commands/buffer';
import { handleStageMultisig } from './commands/stage-multisig';
import { handleStageProgram } from './commands/stage-program';
import { handlePropose } from './commands/propose';
import { handleInspect } from './commands/inspect';
import { handleVote } from './commands/vote';
import { handleExecute } from './commands/execute';
import { handleReceipt } from './commands/receipt';
import { handleProbe } from './commands/probe';

type CommandHandler = (args: readonly string[]) => Promise<number>;

interface Command {
  readonly name: string;
  readonly summary: string;
  readonly handler: CommandHandler;
}

const EXIT_OK = 0;
const EXIT_FAILED = 1;
const EXIT_USAGE = 2;

const COMMANDS: readonly Command[] = [
  { name: 'manifest', summary: 'Hash an artifact and write its release manifest.', handler: handleManifest },
  { name: 'buffer', summary: 'Upload an artifact to a buffer, hand it to the vault and verify it.', handler: handleBuffer },
  { name: 'stage-multisig', summary: 'Create a devnet multisig.', handler: handleStageMultisig },
  { name: 'stage-program', summary: 'Deploy the test program and hand its upgrade authority to the vault.', handler: handleStageProgram },
  { name: 'propose', summary: 'Create a guarded proposal or one of its controlled counterparts.', handler: handlePropose },
  { name: 'inspect', summary: 'Read a proposal and print its verification result and verdict.', handler: handleInspect },
  { name: 'vote', summary: 'Approve or reject a proposal as a local-key member.', handler: handleVote },
  { name: 'execute', summary: 'Execute an approved proposal as a local-key member.', handler: handleExecute },
  { name: 'receipt', summary: 'Reconcile a deployment and write its receipt.', handler: handleReceipt },
  { name: 'probe', summary: 'Call the test program and print its observable behaviour.', handler: handleProbe },
];

const HELP_FLAGS: ReadonlySet<string> = new Set(['help', '--help', '-h']);

function usage(): string {
  const width = Math.max(...COMMANDS.map((command) => command.name.length));
  const rows = COMMANDS.map((command) => `  ${command.name.padEnd(width)}  ${command.summary}`);
  return ['Usage: prepare-release <command> [options]', '', 'Commands:', ...rows, ''].join('\n');
}

async function main(argv: readonly string[]): Promise<number> {
  const [name, ...args] = argv;
  if (name === undefined || HELP_FLAGS.has(name)) {
    process.stdout.write(usage());
    return EXIT_OK;
  }
  const command = COMMANDS.find((candidate) => candidate.name === name);
  if (command === undefined) {
    process.stderr.write(`prepare-release: unknown command "${name}"\n\n${usage()}`);
    return EXIT_USAGE;
  }
  if (command.handler === undefined) {
    process.stderr.write(`prepare-release: "${command.name}" is not available in this build\n`);
    return EXIT_FAILED;
  }
  return command.handler(args);
}

process.exitCode = await main(process.argv.slice(2));
