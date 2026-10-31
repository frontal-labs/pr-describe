import {
  BACKSLASH_PATTERN,
  BUILTIN_IGNORE,
  GLOB_SPECIAL_CHARS,
  TRAILING_SLASH,
} from "./constants";
import type { ResolvedConfig } from "./types";

const specialRegexChars = new Set(GLOB_SPECIAL_CHARS);

export interface FilterOptions {
  config?: Pick<ResolvedConfig, "ignore">;
}

export function isIgnored(path: string, globs: readonly string[]): boolean {
  const normalized = path.replace(BACKSLASH_PATTERN, "/");
  for (const glob of globs) {
    if (matchGlob(normalized, glob)) {
      return true;
    }
  }
  return false;
}

export function matchGlob(path: string, pattern: string): boolean {
  const normalized = pattern
    .replace(BACKSLASH_PATTERN, "/")
    .replace(TRAILING_SLASH, "");
  const regex = globToRegex(normalized);
  return regex.test(path);
}

function globToRegex(pattern: string): RegExp {
  let regex = "^";
  let i = 0;
  const n = pattern.length;
  while (i < n) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        // ** matches any number of path segments
        regex += ".*";
        i += 2;
        // consume optional leading slash after **
        if (pattern[i] === "/") {
          regex += "/?";
          i++;
        }
      } else {
        // * matches anything except slash
        regex += "[^/]*";
        i++;
      }
    } else if (c === "?") {
      regex += "[^/]";
      i++;
    } else if (specialRegexChars.has(c)) {
      regex += `\\${c}`;
      i++;
    } else {
      regex += c;
      i++;
    }
  }
  regex += "$";
  return new RegExp(regex);
}

/** The path of a plain path string or of a { path } object. */
const pathOf = (item: string | { path: string }): string =>
  typeof item === "string" ? item : item.path;

/** Keep the items whose path is not ignored. Works on paths and on { path } objects alike. */
export function filterPaths<T extends string | { path: string }>(
  paths: T[],
  options: FilterOptions = {}
): T[] {
  const ignore = [...BUILTIN_IGNORE, ...(options.config?.ignore ?? [])];
  return paths.filter((item) => !isIgnored(pathOf(item), ignore));
}

export function hasSkipLabel(
  labels: string[],
  skipLabels: readonly string[] = []
): boolean {
  if (skipLabels.length === 0) {
    return false;
  }
  const set = new Set(skipLabels.map((l) => l.toLowerCase()));
  return labels.some((l) => set.has(l.toLowerCase()));
}
