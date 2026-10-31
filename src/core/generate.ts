import type { JsonSchemaObject } from "ggml-node";
import type { Provider } from "../providers";
import type { ResolvedConfig } from "./config";
import { matchGlob } from "./filter";
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
  record: ChangeRecord;
}

/**
 * The diff is cut to this many characters before prompting. It matches the
 * 4000-token chunk budget (about 4 characters per token) so the prompt stays
 * inside the provider's context window.
 */
const DIFF_CHAR_LIMIT = 16_000;

const SYSTEM_PROMPT = `You write PR descriptions from a diff. Output only the JSON object.

Rules:
- Describe only what the diff changes. Do not claim tests, issues, reviews or deployments unless the input shows them.
- "summary" is one or two plain sentences.
- "changes", "testing" and "risks" are lists. Each item is one short sentence. "changes" items name a changed file or symbol from the diff.
- "evidence" lists the exact file paths and symbols your items refer to, copied from the diff.
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
  if (paths.every((p) => inAny(p, INTERNAL_PATHS))) {
    return "internal";
  }
  return null;
}

/** Markdown headings for the sections the model fills in. */
const SECTION_HEADINGS: Record<string, string> = {
  changes: "Changes",
  risks: "Risks",
  summary: "Summary",
  testing: "Testing",
};

/** JSON Schema the model output is constrained to. */
export const RECORD_SCHEMA: JsonSchemaObject = {
  additionalProperties: false,
  properties: {
    audience: { enum: VALID_AUDIENCES, type: "string" },
    breaking: { type: "boolean" },
    changes: { items: { type: "string" }, type: "array" },
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
    "changes",
    "testing",
    "risks",
  ],
  type: "object",
};

export async function generateDescription(
  provider: Provider,
  data: {
    title: string;
    body: string;
    commits: string[];
    issueNumbers: string[];
    diff: string;
    prTemplate: string | null;
    config: ResolvedConfig;
  }
): Promise<GenerateResult> {
  const prompt = buildPrompt(data);

  // The schema constrains the output shape, so a retry only helps when the
  // content fails validation (for example an empty summary).
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
      const result = parseOutput(raw, data.config.sections);
      return groundRecord(result, {
        paths: changedPaths(data.diff),
        prompt,
        scopes: data.config.scopes,
      });
    } catch (err) {
      lastError = err as Error;
    }
  }
  throw new Error(
    `Generation failed after retries: ${lastError?.message ?? "unknown"}`
  );
}

function buildPrompt(data: {
  title: string;
  body: string;
  commits: string[];
  issueNumbers: string[];
  diff: string;
  prTemplate: string | null;
  config: ResolvedConfig;
}): string {
  const diff = data.diff.slice(0, DIFF_CHAR_LIMIT);
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

interface SectionFields {
  changes: string[];
  risks: string[];
  summary: string;
  testing: string[];
}

function parseOutput(raw: unknown, sections: string[]): GenerateResult {
  if (raw === null || typeof raw !== "object") {
    throw new Error("Model output is not an object");
  }
  const { summary, changes, testing, risks, ...fields } = raw as CoerceInput &
    Partial<Record<keyof SectionFields, unknown>>;
  if (typeof summary !== "string" || summary.trim() === "") {
    throw new Error("Model output has an empty summary");
  }
  const record = coerceRecord(fields);
  const errors = validateRecord(record);
  if (errors.length > 0) {
    throw new Error(`Validation errors: ${JSON.stringify(errors)}`);
  }
  const description = renderDescription(
    {
      changes: listOf(changes),
      risks: listOf(risks),
      summary: summary.trim(),
      testing: listOf(testing),
    },
    sections
  );
  return { description, record };
}

/** Keep only non-empty string items, and strip any bullet the model added. */
function listOf(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim().replace(/^[-*]\s+/, ""))
    .filter((v) => v.length > 0 && !PLACEHOLDERS.has(v.toLowerCase()));
}

/**
 * Build the markdown body from the model's fields. Headings come from the
 * config's `sections`, so the layout is fixed by code, not by the model.
 * Sections without a model field (for example `breaking`, `links`) are skipped.
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
        : bulletsOrNone(fields[key as "changes" | "risks" | "testing"]);
    blocks.push(`## ${heading}\n\n${body}`);
  }
  return blocks.join("\n\n");
}

function bulletsOrNone(items: string[]): string {
  return items.length > 0 ? items.map((i) => `- ${i}`).join("\n") : "- None";
}

/** Paths of the files a unified diff touches. */
export function changedPaths(diff: string): string[] {
  return [...diff.matchAll(/^diff --git a\/(.+?) b\//gm)].map((m) => m[1]);
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
  if (best) {
    return best;
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

/**
 * Remove values the model could not have taken from the input (links that do
 * not appear in the prompt, placeholder evidence such as "none"), and resolve
 * the scope from the changed paths.
 */
export function groundRecord(
  result: GenerateResult,
  input: {
    paths: string[];
    prompt: string;
    scopes: Record<string, string[]>;
  }
): GenerateResult {
  const evidence = result.record.evidence
    .map((e) => e.trim())
    .filter((e) => e.length > 0 && !PLACEHOLDERS.has(e.toLowerCase()));
  const links = result.record.links.filter((l) => input.prompt.includes(l));
  const scope = resolveScope(input.paths, input.scopes, result.record.scope);
  const type = typeFromPaths(input.paths) ?? result.record.type;
  return {
    ...result,
    record: { ...result.record, evidence, links, scope, type },
  };
}

const PLACEHOLDERS = new Set(["none", "n/a", "na", "null", "-"]);

/**
 * Drop bullets that do not mention any evidence entry. Rules:
 * - With no evidence, nothing can be checked, so every bullet is kept.
 * - A "- None" placeholder is always kept.
 * - Paragraph lines (for example the summary) are never touched.
 * - A section that had bullets but lost all of them gets "- None", so the
 *   heading is never left empty.
 */
export function filterClaimsByEvidence(
  record: ChangeRecord,
  description: string
): { record: ChangeRecord; description: string } {
  const evidence = record.evidence.map((e) => e.toLowerCase());
  const isBullet = (line: string) => /^\s*[-*]\s+/.test(line);
  const bulletText = (line: string) =>
    (/^\s*[-*]\s+(.+)/.exec(line)?.[1] ?? "").toLowerCase();

  const sections: Array<{ heading: string | null; lines: string[] }> = [];
  let current: { heading: string | null; lines: string[] } = {
    heading: null,
    lines: [],
  };
  for (const line of description.split("\n")) {
    if (line.startsWith("## ")) {
      sections.push(current);
      current = { heading: line, lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push(current);

  const out: string[] = [];
  for (const section of sections) {
    const kept = section.lines.filter((line) => {
      if (!isBullet(line)) {
        return true;
      }
      const claim = bulletText(line);
      if (claim === "none" || evidence.length === 0) {
        return true;
      }
      return evidence.some((e) => claim.includes(e));
    });
    const hadBullets = section.lines.some(isBullet);
    const hasBullets = kept.some(isBullet);
    if (section.heading !== null) {
      out.push(section.heading);
    }
    out.push(...kept);
    if (section.heading !== null && hadBullets && !hasBullets) {
      out.push("", "- None");
    }
    out.push("");
  }
  const text = out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { description: text, record };
}
