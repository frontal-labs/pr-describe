import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_FILE } from "./constants";
import { ConfigSchema, type ResolvedConfig } from "./types";
import { formatIssues, messageOf, UsageError } from "./validate";

/** The config used when no file exists. */
export const DEFAULT_CONFIG: ResolvedConfig = ConfigSchema.parse({});

/**
 * Read `.describerc.json` from `cwd`. A missing file gives the defaults. A
 * present file must be a valid config: unknown keys and bad values are errors
 * that name the file.
 */
export async function loadConfig(
  cwd: string = process.cwd()
): Promise<ResolvedConfig> {
  const path = join(cwd, CONFIG_FILE);
  if (!existsSync(path)) {
    return DEFAULT_CONFIG;
  }
  return parseConfig(readFileSync(path, "utf-8"), path);
}

/** Parse and validate config JSON. `source` names the file in errors. */
export function parseConfig(text: string, source: string): ResolvedConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new UsageError(`${source} is not valid JSON: ${messageOf(err)}`, {
      cause: err,
    });
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new UsageError(`${source} must contain a JSON object`);
  }
  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new UsageError(`${source} is invalid: ${formatIssues(result.error)}`);
  }
  return result.data;
}
