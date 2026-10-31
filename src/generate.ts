import {
  BREAKING_TEXT,
  BULLET_PREFIX,
  DIFF_CHAR_LIMIT,
  DIFF_LEFT_PATH,
  DOCS_PATHS,
  EVIDENCE_PREFIX,
  INTERNAL_PATHS,
  MAX_GENERATION_ATTEMPTS,
  NONE_LISTED,
  NOT_STATED,
  PLACEHOLDER_VALUES,
  SCOPE_NAME_PATTERN,
  SECOND_OPINION_DIFF_CHARS,
  SECOND_OPINION_SYSTEM,
  SECTION_HEADINGS,
  SYSTEM_PROMPT,
  TEST_FILE_NOTE,
  TEST_PATHS,
  TEST_SIGNAL_PATH,
} from "./constants";
import { matchGlob } from "./filter";
import {
  changesLines,
  fileChanges,
  groundSentences,
  hasRiskSignal,
  hasTestSignal,
  isGrounded,
} from "./grounding";
import type { Provider } from "./types";
import {
  type ChangeRecord,
  ChangeRecordSchema,
  type ChangeType,
  type FileChange,
  type GenerateInput,
  type GenerateResult,
  MODEL_OUTPUT_GRAMMAR,
  type ModelOutput,
  ModelOutputSchema,
  type ResolvedConfig,
  type SectionFields,
  TYPE_SCOPE_GRAMMAR,
  TypeScopeSchema,
} from "./types";
import { asError, formatIssues } from "./validate";

/** Placeholder values that are never a real claim, evidence or list item. */
const PLACEHOLDERS: ReadonlySet<string> = new Set(PLACEHOLDER_VALUES);

/** Everything the grounding checks compare against. */
interface Context {
  changes: FileChange[];
  paths: string[];
  prText: string;
  scopes: ResolvedConfig["scopes"];
  sections: ResolvedConfig["sections"];
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

  // The grammar constrains the shape, so a retry only helps when the content
  // fails validation (for example an empty summary).
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const raw = await provider.generateObject({
      prompt,
      schema: MODEL_OUTPUT_GRAMMAR,
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
      lastError = asError(err);
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
 * Classify `type` and `scope` a second time, with different wording, for each
 * field that code cannot decide. A disagreement, or an invalid second answer,
 * means the field is not confirmed.
 */
async function checkUncertainFields(
  provider: Provider,
  data: GenerateInput,
  ctx: Context,
  record: ChangeRecord
): Promise<Array<"type" | "scope">> {
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
      `Diff excerpt:\n${data.promptDiff.slice(0, SECOND_OPINION_DIFF_CHARS)}`,
    ].join("\n"),
    schema: TYPE_SCOPE_GRAMMAR,
    schemaName: "type_and_scope",
    system: SECOND_OPINION_SYSTEM,
  });
  const second = TypeScopeSchema.safeParse(raw);
  const review: Array<"type" | "scope"> = [];
  if (!second.success) {
    // An invalid second answer confirms nothing.
    if (needType) {
      review.push("type");
    }
    if (needScope) {
      review.push("scope");
    }
    return review;
  }
  if (needType && second.data.type !== record.type) {
    review.push("type");
  }
  if (
    needScope &&
    second.data.scope.trim().toLowerCase() !== record.scope.toLowerCase()
  ) {
    review.push("scope");
  }
  return review;
}

function withReviewBanner(
  description: string,
  review: Array<"type" | "scope">
): string {
  if (review.length === 0) {
    return description;
  }
  return `> **Needs review:** the ${review.join(" and ")} could not be confirmed. Two model checks disagreed.\n\n${description}`;
}

/**
 * Turn the model's raw output into a checked record and description. The
 * output is validated against ModelOutputSchema first. Every claim is then
 * grounded in the input, or dropped. Facts that code can state (the changed
 * files and their line counts) are never taken from the model.
 */
function parseOutput(
  raw: unknown,
  ctx: Context
): { description: string; droppedSentences: number; record: ChangeRecord } {
  const parsed = ModelOutputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Model output is invalid: ${formatIssues(parsed.error)}`);
  }
  const output: ModelOutput = parsed.data;

  let dropped = 0;
  const grounded = (text: string): string => {
    const result = groundSentences(text, ctx.source);
    dropped += result.dropped;
    return result.text;
  };
  const groundItems = (items: string[]): string[] =>
    items.map(grounded).filter((item) => item.length > 0);

  const groundedSummary =
    grounded(output.summary) || `Updates ${ctx.changes.length} file(s).`;
  const groundedField = (text: string) => grounded(text) || groundedSummary;

  const record = ChangeRecordSchema.parse({
    audience: output.audience,
    breaking: output.breaking && BREAKING_TEXT.test(ctx.prText),
    evidence: [
      ...new Set(
        output.evidence.map(cleanEvidence).filter((e) => isEvidence(e, ctx))
      ),
    ],
    links: output.links.filter((l) => isGrounded(l, ctx.source)),
    scope: resolveScope(ctx.paths, ctx.scopes, output.scope),
    summary_customer: groundedField(output.summary_customer),
    summary_internal: groundedField(output.summary_internal),
    type: typeFromPaths(ctx.paths) ?? output.type,
  });

  const description = renderDescription(
    {
      changes: changesLines(ctx.changes),
      risks: hasRiskSignal(ctx.paths, ctx.prText)
        ? groundItems(listOf(output.risks))
        : [],
      summary: groundedSummary,
      testing: testingItems(output.testing, ctx),
    },
    ctx.sections
  );
  return { description, droppedSentences: dropped, record };
}

/** Drop the git "a/" or "b/" prefix and surrounding spaces. */
function cleanEvidence(entry: string): string {
  return entry.trim().replace(EVIDENCE_PREFIX, "");
}

/** Evidence counts when it is a changed path, or text the input contains. */
function isEvidence(entry: string, ctx: Context): boolean {
  if (entry.length === 0 || PLACEHOLDERS.has(entry.toLowerCase())) {
    return false;
  }
  return ctx.paths.includes(entry) || isGrounded(entry, ctx.source);
}

/**
 * The Testing items. The model's grounded items come first. If it names none,
 * each changed test file is listed, so the section still reports what the diff
 * shows. With no signal at all, the list is empty.
 */
function testingItems(modelItems: string[], ctx: Context): string[] {
  if (!hasTestSignal(ctx.paths, ctx.prText)) {
    return [];
  }
  const grounded = listOf(modelItems)
    .map((item) => groundSentences(item, ctx.source).text)
    .filter((item) => item.length > 0);
  if (grounded.length > 0) {
    return grounded;
  }
  return ctx.paths
    .filter((p) => TEST_SIGNAL_PATH.test(p))
    .map((p) => `${TEST_FILE_NOTE}: \`${p}\``);
}

/** Keep non-empty string items, strip any bullet the model added. */
function listOf(items: string[]): string[] {
  return items
    .map((v) => v.trim().replace(BULLET_PREFIX, ""))
    .filter((v) => v.length > 0 && !PLACEHOLDERS.has(v.toLowerCase()));
}

/**
 * Build the markdown body. Headings come from the config's `sections`, so the
 * layout is fixed by code. Empty Testing and Risks read "Not stated", not
 * "None", because nothing was checked for them.
 */
export function renderDescription(
  fields: SectionFields,
  sections: ResolvedConfig["sections"]
): string {
  const blocks: string[] = [];
  for (const key of sections) {
    const body =
      key === "summary"
        ? fields.summary
        : bulletsOrPlaceholder(
            fields[key],
            key === "changes" ? NONE_LISTED : NOT_STATED
          );
    blocks.push(`## ${SECTION_HEADINGS[key]}\n\n${body}`);
  }
  return blocks.join("\n\n");
}

function bulletsOrPlaceholder(items: string[], placeholder: string): string {
  return items.length > 0 ? items.map((i) => `- ${i}`).join("\n") : placeholder;
}

/** Paths of the files a unified diff touches. */
export function changedPaths(diff: string): string[] {
  return [...diff.matchAll(DIFF_LEFT_PATH)].map((m) => m[1]);
}

/** Test-only and CI/lockfile-only changes are fixed by path; anything else is left to the model. */
export function typeFromPaths(paths: string[]): ChangeType | null {
  if (paths.length === 0) {
    return null;
  }
  const inAny = (p: string, globs: readonly string[]) =>
    globs.some((g) => matchGlob(p, g));
  if (paths.every((p) => inAny(p, DOCS_PATHS))) {
    return "docs";
  }
  if (paths.every((p) => inAny(p, INTERNAL_PATHS) || inAny(p, TEST_PATHS))) {
    return "internal";
  }
  return null;
}

/** The scope whose globs match the most changed files, or null when none match. */
export function scopeFromGlobs(
  paths: string[],
  scopes: ResolvedConfig["scopes"]
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
  scopes: ResolvedConfig["scopes"],
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
  if (names.length === 0 && SCOPE_NAME_PATTERN.test(candidate)) {
    return candidate;
  }
  return "core";
}
