// Runs the real model over the fixtures and reports:
// - how often type, scope and breaking match the expected values,
// - how many fields the model could not confirm (second opinion disagreed),
// - how many sentences grounding removed, and
// - whether any concrete claim left in the output is missing from the input.
// Usage: bun run eval            (env: EVAL_MODEL to pick a model)
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseFileDiffs } from "../src/collect";
import { generateDescription } from "../src/generate";
import { claimTokens, isGrounded } from "../src/grounding";
import { DEFAULT_CONFIG } from "../src/loader";
import { getProvider } from "../src/providers";
import {
  type FixtureExpectation,
  FixtureExpectationSchema,
  type ResolvedConfig,
} from "../src/types";
import { messageOf, parseOrThrow } from "../src/validate";

interface Row {
  actual: { breaking: boolean; scope: string; type: string } | null;
  droppedSentences: number;
  error?: string;
  expected: FixtureExpectation;
  ms: number;
  name: string;
  review: string[];
  ungrounded: string[];
}

const dir = join(import.meta.dir, "fixtures");
const names = readdirSync(dir)
  .filter((f) => f.endsWith(".diff"))
  .map((f) => f.slice(0, -".diff".length))
  .sort();

const expectations = new Map<string, FixtureExpectation>(
  names.map((name) => [
    name,
    parseOrThrow(
      FixtureExpectationSchema,
      JSON.parse(readFileSync(join(dir, `${name}.json`), "utf-8")),
      `${name}.json`
    ),
  ])
);

// Scope names come from the fixtures, the way a repo would list its scopes.
const scopes = Object.fromEntries(
  [...new Set([...expectations.values()].map((e) => e.scope))].map((s) => [
    s,
    [],
  ])
);
const config: ResolvedConfig = { ...DEFAULT_CONFIG, scopes };

const provider = getProvider("ggml-node", {
  model: process.env.EVAL_MODEL || undefined,
});

/** Claims in the rendered description that the input does not contain. */
function ungroundedClaims(description: string, source: string): string[] {
  return claimTokens(description).filter((t) => !isGrounded(t, source));
}

const rows: Row[] = [];

try {
  for (const name of names) {
    const started = Date.now();
    const diff = readFileSync(join(dir, `${name}.diff`), "utf-8");
    const expected = expectations.get(name);
    if (!expected) {
      throw new Error(`No expectation for fixture ${name}`);
    }
    const title = expected.title ?? `Fixture ${name}`;
    const files = parseFileDiffs(diff);
    const source = [
      title,
      `fixture ${name}`,
      ...files.map((f) => `${f.path}\n${f.diff}`),
    ].join("\n");
    try {
      const result = await generateDescription(provider, {
        body: "",
        commits: [`fixture ${name}`],
        config,
        files,
        issueNumbers: [],
        promptDiff: diff,
        prTemplate: null,
        title,
      });
      rows.push({
        actual: {
          breaking: result.record.breaking,
          scope: result.record.scope,
          type: result.record.type,
        },
        droppedSentences: result.droppedSentences,
        expected,
        ms: Date.now() - started,
        name,
        review: result.review,
        ungrounded: ungroundedClaims(result.description, source),
      });
    } catch (err) {
      rows.push({
        actual: null,
        droppedSentences: 0,
        error: messageOf(err),
        expected,
        ms: Date.now() - started,
        name,
        review: [],
        ungrounded: [],
      });
    }
    const last = rows.at(-1);
    if (!last) {
      throw new Error("no result recorded");
    }
    const detail = last.error
      ? `ERROR ${last.error}`
      : `${JSON.stringify(last.actual)} review=${last.review.join("+") || "-"} dropped=${last.droppedSentences} ungrounded=${last.ungrounded.length}`;
    console.log(`${name}: ${detail} (${last.ms} ms)`);
  }
} finally {
  await provider.dispose();
}

const count = (pick: (r: Row) => boolean) => rows.filter(pick).length;
const summary = {
  breaking: {
    correct: count((r) => r.actual?.breaking === r.expected.breaking),
    total: rows.length,
  },
  droppedSentences: rows.reduce((sum, r) => sum + r.droppedSentences, 0),
  errors: count((r) => r.actual === null),
  model: process.env.EVAL_MODEL || "default",
  review: { flagged: count((r) => r.review.length > 0), total: rows.length },
  scope: {
    correct: count((r) => r.actual?.scope === r.expected.scope),
    total: rows.length,
  },
  type: {
    correct: count((r) => r.actual?.type === r.expected.type),
    total: rows.length,
  },
  ungroundedOutputs: count((r) => r.ungrounded.length > 0),
};
console.log(JSON.stringify(summary, null, 2));

writeFileSync(
  join(dir, "eval-report.json"),
  JSON.stringify({ rows, summary }, null, 2)
);
