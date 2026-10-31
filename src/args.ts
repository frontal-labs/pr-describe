/** A problem with how the CLI was called. Shown as a message, not a stack trace. */
export class UsageError extends Error {}

/** Parsed command line: the command word and its `--flag` / `--flag value` pairs. */
export interface Cli {
  command: string;
  flags: Map<string, string | true>;
}

export function parseArgs(argv: string[]): Cli {
  const flags = new Map<string, string | true>();
  let command: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      command ??= arg;
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags.set(key, next);
      i++;
    } else {
      flags.set(key, true);
    }
  }
  return { command: command ?? "describe", flags };
}

export const value = (cli: Cli, key: string): string | undefined => {
  const v = cli.flags.get(key);
  return typeof v === "string" ? v : undefined;
};

export const on = (cli: Cli, key: string): boolean => cli.flags.has(key);
