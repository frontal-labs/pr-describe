import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_CONFIG,
  type FrontalConfig,
  type ResolvedConfig,
} from "./config";

export async function loadConfig(
  cwd: string = process.cwd()
): Promise<ResolvedConfig> {
  const candidates = [
    join(cwd, ".frontal", "pr-describe.yml"),
    join(cwd, "pr-describe.yml"),
    join(cwd, ".pr-describe.yml"),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      const text = readFileSync(path, "utf-8");
      const parsed = parseYaml(text);
      return { ...DEFAULT_CONFIG, ...parsed } as ResolvedConfig;
    }
  }
  return DEFAULT_CONFIG;
}

function parseYaml(text: string): FrontalConfig {
  const result: Record<string, unknown> = {};
  const lines = text.split("\n");
  let currentKey: string | null = null;
  let currentArr: string[] = [];
  let inArray = false;
  for (const raw of lines) {
    if (/^\s*$/.test(raw)) {
      continue;
    }
    const arrMatch = /^\s+-\s+(.+)$/.exec(raw);
    if (arrMatch && inArray && currentKey) {
      currentArr.push(stripQuotes(arrMatch[1].trim()));
      continue;
    }
    if (inArray && currentKey) {
      result[currentKey] = currentArr;
      currentArr = [];
      inArray = false;
    }
    const kv = /^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/.exec(raw);
    if (kv) {
      const key = kv[1];
      const value = kv[2].trim();
      if (value.startsWith("[") && value.endsWith("]")) {
        result[key] = value
          .slice(1, -1)
          .split(",")
          .map((s) => stripQuotes(s.trim()));
        inArray = false;
      } else if (value === "") {
        currentKey = key;
        currentArr = [];
        inArray = true;
      } else {
        result[key] = parseValue(value);
        inArray = false;
      }
    }
  }
  if (inArray && currentKey) {
    result[currentKey] = currentArr;
  }
  return result as FrontalConfig;
}

function stripQuotes(s: string): string {
  return s.replace(/^['"]|['"]$/g, "");
}

function parseValue(value: string): unknown {
  const stripped = stripQuotes(value);
  if (stripped === "true") {
    return true;
  }
  if (stripped === "false") {
    return false;
  }
  if (!Number.isNaN(Number(stripped)) && stripped !== "") {
    return Number(stripped);
  }
  return stripped;
}
