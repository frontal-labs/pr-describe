import { DEFAULT_CONFIG, type FrontalConfig } from "./config";

const DEFAULT_IGNORE: string[] = [
  "**/bun.lock",
  "**/bun.lockb",
  "**/package-lock.json",
  "**/yarn.lock",
  "**/pnpm-lock.yaml",
  "**/dist/**",
  "**/build/**",
  "**/vendor/**",
  "**/*.snap",
  "**/*.min.js",
  "**/*.min.css",
  "**/*.generated.*",
  "**/*.auto.*",
  "**/generated/**",
  "**/auto-generated/**",
  "**/codegen/**",
  "**/__generated__/**",
];

export interface FilterOptions {
  config?: FrontalConfig;
  skip_labels?: string[];
}

const specialRegexChars = new Set([
  ".",
  "+",
  "^",
  "$",
  "{",
  "}",
  "(",
  ")",
  "|",
  "[",
  "]",
  "\\",
]);

export function isIgnored(path: string, globs: string[]): boolean {
  const normalized = path.replace(/\\/g, "/");
  for (const glob of globs) {
    if (matchGlob(normalized, glob)) {
      return true;
    }
  }
  return false;
}

export function matchGlob(path: string, pattern: string): boolean {
  const normalized = pattern.replace(/\\/g, "/").replace(/\/$/, "");
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
      regex += "\\".concat(c);
      i++;
    } else {
      regex += c;
      i++;
    }
  }
  regex += "$";
  return new RegExp(regex);
}

export function filterPaths(paths: string[], options?: FilterOptions): string[];
export function filterPaths<T extends { path: string }>(
  paths: T[],
  options?: FilterOptions
): T[];
export function filterPaths<T extends { path: string } | string>(
  paths: T[],
  options: FilterOptions = {}
): T[] {
  const ignore = [
    ...DEFAULT_IGNORE,
    ...(options.config?.ignore ?? DEFAULT_CONFIG.ignore),
  ];
  if (paths.length === 0) {
    return [];
  }
  const first = paths[0];
  if (typeof first === "string") {
    return (paths as string[]).filter((p) => !isIgnored(p, ignore)) as T[];
  }
  return (paths as { path: string }[]).filter(
    (p) => !isIgnored(p.path, ignore)
  ) as T[];
}

export function hasSkipLabel(
  labels: string[],
  skipLabels: string[] = DEFAULT_CONFIG.skip_labels
): boolean {
  if (skipLabels.length === 0) {
    return false;
  }
  const set = new Set(skipLabels.map((l) => l.toLowerCase()));
  return labels.some((l) => set.has(l.toLowerCase()));
}
