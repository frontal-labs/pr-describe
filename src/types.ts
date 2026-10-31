// Shared types. Data shapes are zod schemas; the TypeScript types are inferred
// from them, so validation and types cannot drift apart. Plain interfaces are
// used only for contracts that are not data (providers, dependency injection).
import type { JsonSchemaObject } from "ggml-node";
import { z } from "zod";
import {
  AUDIENCES,
  CHANGE_TYPES,
  CHANGELOG_FORMATS,
  DEFAULT_AUDIENCE,
  DEFAULT_LARGE_CHANGE_THRESHOLD,
  DEFAULT_PROVIDER,
  DEFAULT_SCOPE,
  DEFAULT_SECTIONS,
  MODELS,
  PROVIDERS,
  RECORD_SCHEMA_VERSION,
  SECTIONS,
} from "./constants";

// ---------------------------------------------------------------------------
// Enums. Each comes from one constant array in constants.ts.
// ---------------------------------------------------------------------------

export const ChangeTypeSchema = z.enum(CHANGE_TYPES);
export type ChangeType = z.infer<typeof ChangeTypeSchema>;

export const AudienceSchema = z.enum(AUDIENCES, {
  error: (issue) =>
    `Unknown audience: ${String(issue.input)}. Use one of: ${AUDIENCES.join(", ")}`,
});
export type Audience = z.infer<typeof AudienceSchema>;

export const SectionSchema = z.enum(SECTIONS);
export type Section = z.infer<typeof SectionSchema>;

export const ProviderNameSchema = z.enum(PROVIDERS);
export type ProviderName = z.infer<typeof ProviderNameSchema>;

export const ModelIdSchema = z.enum(MODELS);
export type ModelId = z.infer<typeof ModelIdSchema>;

export const ChangelogFormatSchema = z.enum(CHANGELOG_FORMATS, {
  error: (issue) =>
    `Unknown format: ${String(issue.input)}. Use one of: ${CHANGELOG_FORMATS.join(", ")}`,
});
export type ChangelogFormat = z.infer<typeof ChangelogFormatSchema>;

// ---------------------------------------------------------------------------
// Small refinements, shared by several schemas.
// ---------------------------------------------------------------------------

/** A string with at least one non-space character. */
const nonBlank = (message: string) =>
  z.string().refine((value) => value.trim().length > 0, { message });

/** A repository-relative path or a glob. No leading slash, no empty segments. */
const globPattern = z
  .string()
  .min(1)
  .refine((value) => !value.startsWith("/"), {
    message: "globs must be relative",
  });

// ---------------------------------------------------------------------------
// Change record: what gets stored in PR bodies and written to .changes/.
// Missing optional fields take defaults, so older records still parse.
// ---------------------------------------------------------------------------

export const ChangeRecordFieldsSchema = z
  .object({
    audience: AudienceSchema.default(DEFAULT_AUDIENCE),
    breaking: z.boolean().default(false),
    evidence: z
      .array(nonBlank("evidence entries must not be blank"))
      .default([]),
    links: z.array(nonBlank("links must not be blank")).default([]),
    scope: nonBlank("scope must not be blank").default(DEFAULT_SCOPE),
    summary_customer: z.string().default(""),
    summary_internal: z.string().default(""),
    type: ChangeTypeSchema,
  })
  .strict();
export type ChangeRecordFields = z.output<typeof ChangeRecordFieldsSchema>;

/** The full record in memory, with the schema version. Never written to JSON. */
export const ChangeRecordSchema = ChangeRecordFieldsSchema.extend({
  schema: z.literal(RECORD_SCHEMA_VERSION).default(RECORD_SCHEMA_VERSION),
});
export type ChangeRecord = z.output<typeof ChangeRecordSchema>;

// ---------------------------------------------------------------------------
// Model output: what the model must return. Every field is required, so the
// grammar forces a complete answer. Refinements keep the JSON schema simple.
// ---------------------------------------------------------------------------

export const ModelOutputSchema = z
  .object({
    audience: AudienceSchema,
    breaking: z.boolean(),
    evidence: z.array(z.string()),
    links: z.array(z.string()),
    risks: z.array(z.string()),
    scope: z.string().refine((value) => value.trim().length > 0, {
      message: "scope must not be blank",
    }),
    summary: z.string().refine((value) => value.trim().length > 0, {
      message: "summary must not be empty",
    }),
    summary_customer: z.string(),
    summary_internal: z.string(),
    testing: z.array(z.string()),
    type: ChangeTypeSchema,
  })
  .strict();
export type ModelOutput = z.output<typeof ModelOutputSchema>;

/** The second, differently worded check on type and scope. */
export const TypeScopeSchema = z
  .object({
    scope: z.string(),
    type: ChangeTypeSchema,
  })
  .strict();
export type TypeScope = z.output<typeof TypeScopeSchema>;

/**
 * Turn a zod schema into the JSON Schema the local grammar accepts. The
 * `$schema` key is dropped because the grammar does not need it.
 */
export function grammarSchema(schema: z.ZodType): JsonSchemaObject {
  const json: Record<string, unknown> = z.toJSONSchema(schema);
  const { $schema: _unused, ...rest } = json;
  return rest;
}

/** The grammar the model's answer must follow. Derived from the schema, never written twice. */
export const MODEL_OUTPUT_GRAMMAR = grammarSchema(ModelOutputSchema);
/** The grammar of the second opinion. */
export const TYPE_SCOPE_GRAMMAR = grammarSchema(TypeScopeSchema);

/** A boolean environment flag: "true", "1", "yes" and "on" are on. */
export const FlagSchema = z.stringbool();

// ---------------------------------------------------------------------------
// Configuration: .describerc.json. Strict, so a typo or an old key fails
// loudly instead of being ignored.
// ---------------------------------------------------------------------------

export const ConfigSchema = z
  .object({
    ignore: z.array(globPattern).default([]),
    large_change_threshold: z
      .number()
      .int()
      .positive()
      .default(DEFAULT_LARGE_CHANGE_THRESHOLD),
    model: ModelIdSchema.optional(),
    provider: ProviderNameSchema.default(DEFAULT_PROVIDER),
    scopes: z
      .record(nonBlank("scope names must not be blank"), z.array(globPattern))
      .default({}),
    sections: z
      .array(SectionSchema)
      .min(1, { message: "sections must not be empty" })
      .default([...DEFAULT_SECTIONS]),
    skip_labels: z.array(nonBlank("labels must not be blank")).default([]),
  })
  .strict();
/** What the file may contain (before defaults are applied). */
export type FrontalConfig = z.input<typeof ConfigSchema>;
/** The config the tool uses (after defaults). */
export type ResolvedConfig = z.output<typeof ConfigSchema>;

// ---------------------------------------------------------------------------
// GitHub API responses. Parsed at the boundary, so a changed or unexpected
// response fails with a clear message instead of a TypeError later.
// ---------------------------------------------------------------------------

const login = z.object({ login: z.string() });

export const PullRequestSchema = z.object({
  base: z.object({ ref: z.string() }),
  body: z.string().nullable(),
  head: z.object({
    ref: z.string(),
    repo: z.object({ owner: login }).nullable(),
    sha: z.string(),
  }),
  labels: z.array(z.object({ name: z.string() })),
  number: z.number().int(),
  title: z.string(),
  user: login.nullable(),
});
export type PullRequest = z.output<typeof PullRequestSchema>;

/** The part of a PR a changelog needs: where its record is kept. */
export const PullRequestSummarySchema = PullRequestSchema.pick({
  body: true,
  title: true,
});

export const CommitListSchema = z.array(
  z.object({ commit: z.object({ message: z.string() }) })
);

export const CompareSchema = z.object({ commits: CommitListSchema });

/** A repository file as returned by the contents API (base64 content). */
export const FileContentSchema = z.object({ content: z.string() });

// ---------------------------------------------------------------------------
// CLI arguments. Parsed from `--flag value` pairs, then checked here.
// ---------------------------------------------------------------------------

export const DescribeArgsSchema = z
  .object({
    base: z.string().min(1).optional(),
    dryRun: z.boolean(),
    head: z.string().min(1).optional(),
    owner: z.string().min(1).optional(),
    pr: z
      .number()
      .int("--pr must be a whole number")
      .positive("--pr must be positive")
      .optional(),
    repo: z.string().min(1).optional(),
    token: z.string().min(1).optional(),
    update: z.boolean(),
    writeFile: z.boolean(),
  })
  .refine((args) => !args.update || args.pr !== undefined, {
    message: "--update needs --pr <number>",
  });
export type DescribeArgs = z.output<typeof DescribeArgsSchema>;

export const ChangelogArgsSchema = z.object({
  audience: AudienceSchema.optional(),
  format: ChangelogFormatSchema.default("markdown"),
  from: z
    .string({ error: "changelog needs --from <tag>" })
    .min(1, { message: "changelog needs --from <tag>" }),
  owner: z.string().min(1).optional(),
  package: z.string().min(1).optional(),
  repo: z.string().min(1).optional(),
  to: z
    .string({ error: "changelog needs --to <tag>" })
    .min(1, { message: "changelog needs --to <tag>" }),
  token: z.string().min(1).optional(),
});
export type ChangelogArgs = z.output<typeof ChangelogArgsSchema>;

export const InitArgsSchema = z.object({ force: z.boolean() });

// ---------------------------------------------------------------------------
// Plain contracts (not data).
// ---------------------------------------------------------------------------

/** One changed file from a unified diff. */
export interface FileDiff {
  diff: string;
  path: string;
}

/** A group of files packed under the token budget. */
export interface Chunk {
  diff: string;
  files: string[];
  tokenEstimate: number;
}

/** Line counts for one changed file. */
export interface FileChange {
  added: number;
  path: string;
  removed: number;
}

/** A PR (or local range) as read from GitHub or git. */
export interface CollectedData {
  author: string;
  base: string;
  body: string;
  branch: string;
  commits: string[];
  diff: string;
  /** True when the PR head repo differs from the base repo (a fork). */
  fork: boolean;
  head: string;
  /** Owner/login of the PR head repo, when fork is true. */
  headOwner?: string;
  issueNumbers: string[];
  labels: string[];
  owner: string;
  prNumber?: number;
  prTemplate: string | null;
  repo: string;
  title: string;
}

export interface CollectOptions {
  apiUrl?: string;
  base?: string;
  head?: string;
  owner?: string;
  prNumber?: number;
  repo?: string;
  token?: string;
}

/** A change record paired with its PR, as the changelog renderers consume it. */
export interface ChangelogEntry {
  prNumber: number;
  record: ChangeRecord;
  title: string;
}

export interface ChangelogOptions {
  audience?: Audience;
  format?: ChangelogFormat;
  from: string;
  /** Required for the changeset format: the package the changeset bumps. */
  packageName?: string;
  polish?: boolean;
  /** e.g. https://github.com/owner/repo, used to link PR numbers. */
  repoUrl?: string;
  to: string;
}

export interface GenerateInput {
  body: string;
  commits: string[];
  config: ResolvedConfig;
  /** Changed files after filtering, with their full diffs. Facts come from here. */
  files: FileDiff[];
  issueNumbers: string[];
  /** Text the model sees. For large PRs this is the chunk summaries. */
  promptDiff: string;
  prTemplate: string | null;
  title: string;
}

export interface GenerateResult {
  description: string;
  /** Sentences and items removed because they were not grounded in the input. */
  droppedSentences: number;
  record: ChangeRecord;
  /** Fields the model could not confirm: "type" and/or "scope". Empty when confirmed. */
  review: Array<"type" | "scope">;
}

/** The description sections, after grounding. */
export interface SectionFields {
  changes: string[];
  risks: string[];
  summary: string;
  testing: string[];
}

/** The parts of a PR body written by the tool. */
export interface MarkerBlock {
  description: string;
  hash: string;
  raw: string;
  recordJson: string;
}

export interface TextInput {
  prompt: string;
  system: string;
}

export interface ObjectInput extends TextInput {
  schema: JsonSchemaObject;
  schemaName: string;
}

export interface ProviderOptions {
  model?: string;
}

/** The inference contract. Implementations: the local ggml-node model and a mock. */
export interface Provider {
  dispose(): Promise<void>;
  generateObject(input: ObjectInput): Promise<unknown>;
  generateText(input: TextInput): Promise<string>;
  name: string;
}

export interface DescribeTarget {
  owner: string;
  prNumber?: number;
  repo: string;
}

export type DescribeOutcome =
  | { status: "skipped"; reason: string; target: DescribeTarget }
  | { status: "edited"; body: string; target: DescribeTarget }
  | {
      status: "generated";
      body: string;
      description: string;
      droppedSentences: number;
      record: ChangeRecord;
      recordJson: string;
      review: Array<"type" | "scope">;
      target: DescribeTarget;
    };

/** Dependencies of the describe pipeline, injected so it runs without GitHub or a model. */
export interface DescribeDeps {
  collect: (options: CollectOptions) => Promise<CollectedData>;
  provider: Provider;
}

/** Parsed command line: the command word and its `--flag` / `--flag value` pairs. */
export interface Cli {
  command: string;
  flags: Map<string, string | true>;
}

// ---------------------------------------------------------------------------
// Other JSON files the tool reads.
// ---------------------------------------------------------------------------

/** A fixture's expected values, in tests/fixtures/<name>.json. */
export const FixtureExpectationSchema = z
  .object({
    breaking: z.boolean(),
    scope: z.string().min(1),
    title: z.string().optional(),
    type: ChangeTypeSchema,
  })
  .strict();
export type FixtureExpectation = z.output<typeof FixtureExpectationSchema>;

/** The part of package.json the changelog needs. */
export const PackageJsonSchema = z
  .object({ name: z.string().min(1) })
  .passthrough();

/** The status of an HTTP error thrown by the GitHub client. */
export const HttpErrorSchema = z.object({ status: z.number() });
