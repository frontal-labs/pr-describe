import { z } from "zod";
import { COMMANDS, DEFAULT_COMMAND, FLAG_PREFIX } from "./constants";
import type { Cli } from "./types";
import { formatIssues, UsageError } from "./validate";

/** Split argv into the command word and `--flag` / `--flag value` pairs. */
export function parseArgs(argv: string[]): Cli {
  const flags = new Map<string, string | true>();
  let command: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith(FLAG_PREFIX)) {
      command ??= arg;
      continue;
    }
    const key = arg.slice(FLAG_PREFIX.length);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith(FLAG_PREFIX)) {
      flags.set(key, next);
      i++;
    } else {
      flags.set(key, true);
    }
  }
  return { command: command ?? DEFAULT_COMMAND, flags };
}

/** The command, checked against the known commands. */
export function commandOf(cli: Cli): (typeof COMMANDS)[number] {
  const parsed = z.enum(COMMANDS).safeParse(cli.command);
  if (!parsed.success) {
    throw new UsageError(`Unknown command: ${cli.command}`);
  }
  return parsed.data;
}

/** A flag's string value, or undefined when it is absent or given without a value. */
export const value = (cli: Cli, key: string): string | undefined => {
  const v = cli.flags.get(key);
  return typeof v === "string" ? v : undefined;
};

/** Whether a boolean flag is present. */
export const on = (cli: Cli, key: string): boolean => cli.flags.has(key);

/** Parse parsed flags with a schema. A failure becomes a UsageError with every problem. */
export function parseUsage<T extends z.ZodType>(
  schema: T,
  input: unknown
): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new UsageError(formatIssues(result.error));
  }
  return result.data;
}
