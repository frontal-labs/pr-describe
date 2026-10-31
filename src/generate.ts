import type { JsonSchemaObject } from "ggml-node";
import type { ResolvedConfig } from "./config";
import { matchGlob } from "./filter";
import {
  changesLines,
  type FileChange,
  fileChanges,
  groundSentences,
  hasRiskSignal,
  hasTestSignal,
  isGrounded,
} from "./grounding";
import type { Provider } from "./providers";
import {
  type ChangeRecord,
  type ChangeType,
  type CoerceInput,
  coerceRecord,
  VALID_AUDIENCES,
  VALID_TYPES,
  validateRecord,
} from "./record";

export interface GenerateResult {
  description: string;
  /** Sentences and items removed because they were not grounded in the input. */
  droppedSentences: number;
  record: ChangeRecord;
  /** Fields the model could not confirm: "type" and/or "scope". Empty when confirmed. */
  review: string[];
}

export interface GenerateInput {
  body: string;
  commits: string[];
  config: ResolvedConfig;
  /** Changed files after filtering, with their full diffs. Facts come from here. */
  files: Array<{ diff: string; path: string }>;
  issueNumbers: string[];
  /** Text the model sees. For large PRs this is the chunk summaries. */
  promptDiff: string;
  prTemplate: string | null;
  title: string;
}

/**
 * The prompt diff is cut to this many characters. It matches the 4000-token
 * chunk budget (about 4 characters per token) so the prompt fits the context.
 */
const DIFF_CHAR_LIMIT = 16_000;

const SYSTEM_PROMPT = `You write PR descriptions from a diff. Output only the JSON object.

Rules:
- Describe only what the diff changes. Do not claim tests, issues, reviews or deployments unless the input shows them.
- "summary" is one or two plain sentences. Name only files, symbols and numbers that appear in the input.
- "testing" and "risks" are lists. Leave them empty unless the input shows tests or risks. Each item is one short sentence.
- "evidence" lists the exact file paths and symbols your summary refers to, copied from the diff.
- "scope" is exactly one name from the scope list. If the list is empty, use a short area name such as api, ui or ci.
- "type" is exactly one of these, chosen by what the change does:
  - feature: adds new behavior or a new capability.
  - fix: corrects behavior that was wrong.
  - perf: makes something faster or uses less memory or resources, with the same behavior.
  - refactor: restructures code with the same behavior.
  - docs: changes only documentation or comments.
  - breaking: removes or changes behavior that callers depend on.
  - internal: CI, dependencies, build or tooling changes with no product behavior change.
- Be factual and concise. No speculation.`;

/** A second, differently worded classification, used to cross-check type and scope. */
const SECOND_OPINION_SYSTEM =
  "Classify one code change. Answer with the change kind and the area of the code only.";

const TYPE_SCOPE_SCHEMA: JsonSchemaObject = {
  additionalProperties: false,
  properties: {
    scope: { type: "string" },
    type: { enum: VALID_TYPES, type: "string" },
  },
  required: ["type", "scope"],
  type: "object",
};

/**
 * Paths whose changes are unambiguous. A change that touches only these files
 * gets a fixed type; the small model is weak at this classification.
 */
const DOCS_PATHS = ["**/*.md", "**/*.mdx", "docs/**", "CHANGELOG*"];
const INTERNAL_PATHS = [
  ".github/**",
  ".changeset/**",
  ".husky/**",
  "**/*.lock",
  "bun.lock",
  "bun.lockb",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "biome.json",
  "bunfig.toml",
  "tsconfig*.json",
];

/** Test-only changes have no product behavior change, so they are internal. */
const TEST_PATHS = [
  "**/*.test.*",
  "**/*.spec.*",
  "tests/**",
  "test/**",
  "__tests__/**",
];

/** The type when every changed path falls under one of the fixed groups. */
export function typeFromPaths(paths: string[]): ChangeType | null {
  if (paths.length === 0) {
    return null;
  }
  const inAny = (p: string, globs: string[]) =>
    globs.some((g) => matchGlob(p, g));
  if (paths.every((p) => inAny(p, DOCS_PATHS))) {
    return "docs";
  }
  if (paths.every((p) => inAny(p, INTERNAL_PATHS) || inAny(p, TEST_PATHS))) {
    return "internal";
  }
  return null;
}

/** Markdown headings for the sections the description can have. */
const SECTION_HEADINGS: Record<string, string> = {
  changes: "Changes",
  risks: "Risks",
  summary: "Summary",
  testing: "Testing",
};

/** JSON Schema the model output is constrained to. `changes` is written by code. */
export const RECORD_SCHEMA: JsonSchemaObject = {
  additionalProperties: false,
  properties: {
    audience: { enum: VALID_AUDIENCES, type: "string" },
    breaking: { type: "boolean" },
    evidence: { items: { type: "string" }, type: "array" },
    links: { items: { type: "string" }, type: "array" },
    risks: { items: { type: "string" }, type: "array" },
    scope: { type: "string" },
    summary: { type: "string" },
    summary_customer: { type: "string" },
    summary_internal: { type: "string" },
    testing: { items: { type: "string" }, type: "array" },
    type: { enum: VALID_TYPES, type: "string" },
  },
  required: [
    "type",
    "audience",
    "scope",
    "breaking",
    "summary_customer",
    "summary_internal",
    "evidence",
    "links",
    "summary",
    "testing",
    "risks",
  ],
  type: "object",
};

const PLACEHOLDERS = new Set(["none", "n/a", "na", "null", "-", "not stated"]);

/** Everything the grounding checks compare against. */
interface Context {
  changes: FileChange[];
  paths: string[];
  prText: string;
  scopes: Record<string, string[]>;
  sections: string[];
  source: string;
}

export async function generateDescription(
  provider: Provider,
  data: GenerateInput
): Promise<GenerateResult> {
  const paths = data.files.map((f) => f.path);
  const prText = [
    data.title,
    data.body,
    ...data.commits,
    ...data.issueNumbers,
  ].join("\n");
  const ctx: Context = {
    changes: fileChanges(data.files),
    paths,
    prText,
    scopes: data.config.scopes,
    sections: data.config.sections,
    // Everything a claim may legitimately refer to: PR text and the full diff.
    source: [prText, ...data.files.map((f) => `${f.path}\n${f.diff}`)].join(
      "\n"
    ),
  };
  const prompt = buildPrompt(data);

  // The schema constrains the shape, so a retry only helps when the content
  // fails validation (for example an empty summary).
  const maxAttempts = 2;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const raw = await provider.generateObject({
      prompt,
      schema: RECORD_SCHEMA,
      schemaName: "change_record",
      system: SYSTEM_PROMPT,
    });
    try {
      const parsed = parseOutput(raw, ctx);
      const review = await checkUncertainFields(
        provider,
        data,
        ctx,
        parsed.record
      );
      return {
        ...parsed,
        description: withReviewBanner(parsed.description, review),
        review,
      };
    } catch (err) {
      lastError = err as Error;
    }
  }
  throw new Error(
    `Generation failed after retries: ${lastError?.message ?? "unknown"}`
  );
}

function buildPrompt(data: GenerateInput): string {
  const diff = data.promptDiff.slice(0, DIFF_CHAR_LIMIT);
  const scopes = Object.keys(data.config.scopes);
  return [
    `PR title: ${data.title}`,
    `PR body: ${data.body || "(none)"}`,
    `Commits: ${data.commits.join("; ") || "(none)"}`,
    `Linked issues: ${data.issueNumbers.join(", ") || "(none)"}`,
    `Scope list: ${scopes.length > 0 ? scopes.join(", ") : "(none, use a short area name)"}`,
    `Diff:\n${diff}`,
  ].join("\n");
}

/**
 * Ask the model a second time, with different wording, about each field that
 * code cannot decide. A disagreement means the field is not confirmed.
 */
async function checkUncertainFields(
  provider: Provider,
  data: GenerateInput,
  ctx: Context,
  record: ChangeRecord
): Promise<string[]> {
  const needType = typeFromPaths(ctx.paths) === null;
  const needScope = scopeFromGlobs(ctx.paths, ctx.scopes) === null;
  if (!(needType || needScope)) {
    return [];
  }
  const raw = await provider.generateObject({
    prompt: [
      `Change title: ${data.title}`,
      `Changed files:\n${ctx.paths.join("\n")}`,
      `Areas: ${Object.keys(ctx.scopes).join(", ") || "(none)"}`,
      `Diff excerpt:\n${data.promptDiff.slice(0, 4000)}`,
    ].join("\n"),
    schema: TYPE_SCOPE_SCHEMA,
    schemaName: "type_and_scope",
    system: SECOND_OPINION_SYSTEM,
  });
  const second = raw as { scope?: unknown; type?: unknown };
  const review: string[] = [];
  if (needType && second.type !== record.type) {
    review.push("type");
  }
  if (
    needScope &&
    (typeof second.scope !== "string" ||
      second.scope.trim().toLowerCase() !== record.scope.toLowerCase())
  ) {
    review.push("scope");
  }
  return review;
}

function withReviewBanner(description: string, review: string[]): string {
  if (review.length === 0) {
    return description;
  }
  const fields = review.join(" and ");
  return `> **Needs review:** the ${fields} could not be confirmed. Two model checks disagreed.\n\n${description}`;
}

/**
 * Turn the model's raw JSON into a checked record and description. Every
 * claim is grounded in the input, or dropped. Facts that code can state
 * (the changed files and their line counts) are never taken from the model.
 */
function parseOutput(
  raw: unknown,
  ctx: Context
): { description: string; droppedSentences: number; record: ChangeRecord } {
  if (raw === null || typeof raw !== "object") {
    throw new Error("Model output is not an object");
  }
  const { summary, testing, risks, ...fields } = raw as CoerceInput &
    Record<string, unknown>;
  if (typeof summary !== "string" || summary.trim() === "") {
    throw new Error("Model output has an empty summary");
  }

  const record = coerceRecord(fields as CoerceInput);
  const errors = validateRecord(record);
  if (errors.length > 0) {
    throw new Error(`Validation errors: ${JSON.stringify(errors)}`);
  }

  let dropped = 0;
  const grounded = (text: string): string => {
    const result = groundSentences(text, ctx.source);
    dropped += result.dropped;
    return result.text;
  };
  const groundItems = (items: string[]): string[] =>
    items.map(grounded).filter((item) => item.length > 0);

  const groundedSummary =
    grounded(summary) || `Updates ${ctx.changes.length} file(s).`;
  const groundedField = (text: string) => grounded(text) || groundedSummary;

  const finalRecord: ChangeRecord = {
    ...record,
    breaking: record.breaking && /\bbreaking\b/i.test(ctx.prText),
    evidence: [
      ...new Set(
        record.evidence
          .map((e) => e.trim().replace(/^[ab]\//, ""))
          .filter(
            (e) =>
              e.length > 0 &&
              !PLACEHOLDERS.has(e.toLowerCase()) &&
              (ctx.paths.includes(e) || isGrounded(e, ctx.source))
          )
      ),
    ],
    links: record.links.filter((l) => isGrounded(l, ctx.source)),
    scope: resolveScope(ctx.paths, ctx.scopes, record.scope),
    summary_customer: groundedField(record.summary_customer),
    summary_internal: groundedField(record.summary_internal),
    type: typeFromPaths(ctx.paths) ?? record.type,
  };

  const description = renderDescription(
    {
      changes: changesLines(ctx.changes),
      risks: hasRiskSignal(ctx.paths, ctx.prText)
        ? groundItems(listOf(risks))
        : [],
      summary: groundedSummary,
      testing: hasTestSignal(ctx.paths, ctx.prText)
        ? groundItems(listOf(testing))
        : [],
    },
    ctx.sections
  );
  return { description, droppedSentences: dropped, record: finalRecord };
}

/** Keep non-empty string items, strip any bullet the model added. */
function listOf(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim().replace(/^[-*]\s+/, ""))
    .filter((v) => v.length > 0 && !PLACEHOLDERS.has(v.toLowerCase()));
}

export interface SectionFields {
  changes: string[];
  risks: string[];
  summary: string;
  testing: string[];
}

/**
 * Build the markdown body. Headings come from the config's `sections`, so the
 * layout is fixed by code. Empty Testing and Risks read "Not stated", not
 * "None", because nothing was checked for them.
 */
export function renderDescription(
  fields: SectionFields,
  sections: string[]
): string {
  const blocks: string[] = [];
  for (const key of sections) {
    const heading = SECTION_HEADINGS[key];
    if (!heading) {
      continue;
    }
    const body =
      key === "summary"
        ? fields.summary
        : bulletsOrPlaceholder(
            fields[key as "changes" | "risks" | "testing"],
            key === "changes" ? "- None" : "- Not stated"
          );
    blocks.push(`## ${heading}\n\n${body}`);
  }
  return blocks.join("\n\n");
}

function bulletsOrPlaceholder(items: string[], placeholder: string): string {
  return items.length > 0 ? items.map((i) => `- ${i}`).join("\n") : placeholder;
}

/** Paths of the files a unified diff touches. */
export function changedPaths(diff: string): string[] {
  return [...diff.matchAll(/^diff --git a\/(.+?) b\//gm)].map((m) => m[1]);
}

/** The scope whose globs match the most changed files, or null when none match. */
export function scopeFromGlobs(
  paths: string[],
  scopes: Record<string, string[]>
): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const [name, globs] of Object.entries(scopes)) {
    const count = paths.filter((p) =>
      globs.some((g) => matchGlob(p, g))
    ).length;
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Pick the scope in code, not from the model's text. The scope whose globs
 * match the most changed files wins. Without a match, the model's answer is
 * kept only when it is exactly one configured scope name (or any single word
 * when no scopes are configured). Otherwise the scope is "core".
 */
export function resolveScope(
  paths: string[],
  scopes: Record<string, string[]>,
  modelScope: string
): string {
  const fromGlobs = scopeFromGlobs(paths, scopes);
  if (fromGlobs) {
    return fromGlobs;
  }
  const candidate = modelScope.trim();
  const names = Object.keys(scopes);
  if (names.includes(candidate)) {
    return candidate;
  }
  if (names.length === 0 && /^[a-z0-9][a-z0-9_-]*$/i.test(candidate)) {
    return candidate;
  }
  return "core";
}
