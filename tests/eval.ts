// Runs the real model over the fixtures and reports how often the change
// record's type, scope and breaking flag match the expected values.
// Usage: bun run eval            (env: EVAL_MODEL to pick a model)
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../src/core/config";
import { generateDescription } from "../src/core/generate";
import { getProvider } from "../src/providers";

interface Expected {
  breaking: boolean;
  scope: string;
  type: string;
}

const dir = join(import.meta.dir, "fixtures");
const names = readdirSync(dir)
  .filter((f) => f.endsWith(".diff"))
  .map((f) => f.slice(0, -".diff".length))
  .sort();

const expectations = new Map<string, Expected>(
  names.map((name) => [
    name,
    JSON.parse(readFileSync(join(dir, `${name}.json`), "utf-8")) as Expected,
  ])
);

// Scope names come from the fixtures, the way a repo would list its scopes.
const scopes = Object.fromEntries(
  [...new Set([...expectations.values()].map((e) => e.scope))].map((s) => [
    s,
    [],
  ])
);

const provider = getProvider("ggml-node", {
  model: process.env.EVAL_MODEL || undefined,
});

const rows: Array<{
  actual: { breaking: boolean; scope: string; type: string } | null;
  error?: string;
  expected: Expected;
  name: string;
  ms: number;
}> = [];

try {
  for (const name of names) {
    const started = Date.now();
    const diff = readFileSync(join(dir, `${name}.diff`), "utf-8");
    const expected = expectations.get(name) as Expected;
    try {
      const result = await generateDescription(provider, {
        body: "",
        commits: [`fixture ${name}`],
        config: { ...DEFAULT_CONFIG, scopes } as never,
        diff,
        issueNumbers: [],
        prTemplate: null,
        title: `Fixture ${name}`,
      });
      rows.push({
        actual: {
          breaking: result.record.breaking,
          scope: result.record.scope,
          type: result.record.type,
        },
        expected,
        ms: Date.now() - started,
        name,
      });
    } catch (err) {
      rows.push({
        actual: null,
        error: (err as Error).message,
        expected,
        ms: Date.now() - started,
        name,
      });
    }
    const last = rows.at(-1) as (typeof rows)[number];
    console.log(
      `${name}: ${last.error ? `ERROR ${last.error}` : JSON.stringify(last.actual)} (${last.ms} ms)`
    );
  }
} finally {
  await provider.dispose();
}

const count = (pick: (r: (typeof rows)[number]) => boolean) =>
  rows.filter(pick).length;
const typeOk = count((r) => r.actual?.type === r.expected.type);
const scopeOk = count((r) => r.actual?.scope === r.expected.scope);
const breakingOk = count((r) => r.actual?.breaking === r.expected.breaking);
const errors = count((r) => r.actual === null);
const total = rows.length;

const summary = {
  breaking: { correct: breakingOk, total },
  errors,
  model: process.env.EVAL_MODEL || "default",
  scope: { correct: scopeOk, total },
  type: { correct: typeOk, total },
};
console.log(JSON.stringify(summary, null, 2));

const reportPath = join(dir, "eval-report.json");
writeFileSync(reportPath, JSON.stringify({ rows, summary }, null, 2));
