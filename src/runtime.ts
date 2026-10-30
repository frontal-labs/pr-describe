import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * Cross-runtime helpers. These use Node's `node:` APIs which Bun also
 * implements, so the compiled `dist/` works under both `bun` and `node`.
 */

export function runGit(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf-8" });
}

export function readTextFileSync(path: string): string {
  return readFileSync(path, "utf-8");
}
