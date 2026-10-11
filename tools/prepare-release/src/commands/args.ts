export interface ParsedArgs {
  readonly positionals: readonly string[];
  readonly flags: Readonly<Record<string, string | boolean>>;
}

export function parseArgs(args: readonly string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positionals.push(arg);
    }
  }

  return { positionals, flags };
}

export function getFlag(flags: Readonly<Record<string, string | boolean>>, name: string): string | undefined {
  const val = flags[name];
  return typeof val === 'string' ? val : undefined;
}

export function getBooleanFlag(flags: Readonly<Record<string, string | boolean>>, name: string): boolean {
  return flags[name] === true;
}
