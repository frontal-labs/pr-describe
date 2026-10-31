import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_CONFIG,
  type FrontalConfig,
  type ResolvedConfig,
} from "./config";

/** Config file name, looked up in the repository root. */
export const CONFIG_FILE = ".describerc.json";

export async function loadConfig(
  cwd: string = process.cwd()
): Promise<ResolvedConfig> {
  const path = join(cwd, CONFIG_FILE);
  if (!existsSync(path)) {
    return DEFAULT_CONFIG;
  }
  return {
    ...DEFAULT_CONFIG,
    ...parseConfig(readFileSync(path, "utf-8"), path),
  };
}

/** Parse config JSON. Throws with the file path if it is not a JSON object. */
export function parseConfig(text: string, source: string): FrontalConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`${source} is not valid JSON: ${(err as Error).message}`, {
      cause: err,
    });
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${source} must contain a JSON object`);
  }
  return parsed as FrontalConfig;
}
