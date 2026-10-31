// Every constant the tool uses. Keep this file free of imports from src/, so
// any module can import it without a cycle. Types derived from these arrays
// live in types.ts.

// Configuration
export const CONFIG_FILE = ".describerc.json";
export const PROVIDERS = ["ggml-node", "mock"] as const;
export const DEFAULT_PROVIDER = "ggml-node";
export const SECTIONS = ["summary", "changes", "testing", "risks"] as const;
export const DEFAULT_SECTIONS = [
  "summary",
  "changes",
  "testing",
  "risks",
] as const;
export const DEFAULT_LARGE_CHANGE_THRESHOLD = 500;

/** Always excluded from the diff, on top of the user's `ignore` globs. */
export const BUILTIN_IGNORE = [
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
] as const;

export const SECTION_HEADINGS = {
  changes: "Changes",
  risks: "Risks",
  summary: "Summary",
  testing: "Testing",
} as const;

// Models and decoding
export const MODELS = ["qwen2.5-0.5b", "qwen2.5-1.5b", "smollm2-360m"] as const;
export const DEFAULT_MODEL = "qwen2.5-1.5b";
export const CONTEXT_SIZE = 8192;
export const MAX_OUTPUT_TOKENS = 1536;
export const GENERATION_SEED = 42;
export const TEMPERATURE = 0;
export const CHARS_PER_TOKEN = 4;

// Change record
export const CHANGE_TYPES = [
  "feature",
  "fix",
  "perf",
  "refactor",
  "docs",
  "breaking",
  "internal",
] as const;
export const AUDIENCES = ["customer", "developer", "internal"] as const;
export const DEFAULT_AUDIENCE = "internal";
export const DEFAULT_SCOPE = "core";
export const RECORD_SCHEMA_VERSION = 1;

// Changelog
export const CHANGELOG_FORMATS = [
  "markdown",
  "github-release",
  "changeset",
  "slack",
] as const;
export const DEFAULT_CHANGELOG_FORMAT = "markdown";
/** Group order in release notes. A breaking record is grouped under "breaking" whatever its type. */
export const CHANGELOG_TYPE_ORDER = [
  "breaking",
  "feature",
  "fix",
  "perf",
  "refactor",
  "docs",
  "internal",
] as const;

// Path rules: changes that touch only these files have a fixed type.
export const DOCS_PATHS = [
  "**/*.md",
  "**/*.mdx",
  "docs/**",
  "CHANGELOG*",
] as const;
export const INTERNAL_PATHS = [
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
] as const;
export const TEST_PATHS = [
  "**/*.test.*",
  "**/*.spec.*",
  "tests/**",
  "test/**",
  "__tests__/**",
] as const;

// Signals that gate the Testing and Risks sections.
export const TEST_SIGNAL_PATH =
  /(^|\/)(__tests__|tests?|spec)\/|\.(test|spec)\.[a-z]+$/i;
export const TEST_SIGNAL_TEXT = /\btests?\b|\bspec\b|\bqa\b/i;
export const RISK_SIGNAL_PATH =
  /(^|\/)(migrations?|config)\/|\.sql$|\.env|schema\./i;
export const RISK_SIGNAL_TEXT =
  /\b(breaking|migration|deprecat\w*|rollback)\b/i;
export const BREAKING_TEXT = /\bbreaking\b/i;

// Grounding
export const PATH_EXTENSION =
  /\.(ts|tsx|js|jsx|mjs|cjs|json|ya?ml|md|mdx|go|py|rs|java|kt|rb|sh|css|scss|html|toml|lock|snap|sql|proto|graphql)$/i;
export const BACKTICK_PATTERN = /`([^`]+)`/g;
export const NUMBER_PATTERN = /\b\d{2,}\b/g;
export const SENTENCE_BREAK = /(?<=[.!?])\s+|\n+/;
export const PLACEHOLDER_VALUES = [
  "none",
  "n/a",
  "na",
  "null",
  "-",
  "not stated",
] as const;
export const NOT_STATED = "- Not stated";
export const NONE_LISTED = "- None";
/** Shown for each changed test file when the model names no tests. Says only what the diff shows. */
export const TEST_FILE_NOTE = "Test file changed";
export const MAX_LISTED_FILES = 50;

// Prompt budgets and limits
export const DIFF_CHAR_LIMIT = 16_000;
export const SECOND_OPINION_DIFF_CHARS = 4000;
export const PROMPT_BUDGET_TOKENS = 4000;
export const SHORT_DESCRIPTION_WORDS = 250;
export const MAX_GENERATION_ATTEMPTS = 2;
export const MAX_REDUCE_ROUNDS = 3;
export const MAX_SUMMARY_CALLS = 20;

// Prompts
export const SYSTEM_PROMPT = `You write PR descriptions from a diff. Output only the JSON object.

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
export const SECOND_OPINION_SYSTEM =
  "Classify one code change. Answer with the change kind and the area of the code only.";

export const CHUNK_SUMMARY_SYSTEM = "You summarize code diffs concisely.";
export const CHUNK_SUMMARY_INSTRUCTION =
  "Summarize the following code diff concisely. Focus on what changed and why. Keep it under 200 words.";

// Marker block in the PR body
export const START_MARKER = "<!-- describe:start";
export const END_MARKER = "<!-- describe:end -->";
export const REGENERATE_CHECKBOX = "- [ ] Regenerate description";
export const REGENERATE_CHECKED = /\[x\]\s*Regenerate description/i;
export const REGENERATE_UNCHECKED = /\[ \]\s*Regenerate description/i;
export const MARKER_HASH_PATTERN = /hash=([a-f0-9]{64})/i;
export const MARKER_HEADER_PATTERN = /^\s*hash=[a-f0-9]{64}\s*-->/i;
export const MARKER_JSON_PATTERN = /```json\n([\s\S]*?)```/;
export const MARKER_JSON_BLOCK = /```json[\s\S]*?```/g;

// GitHub and git
export const PR_TEMPLATE_PATH = ".github/PULL_REQUEST_TEMPLATE.md";
export const GITHUB_WEB_URL = "https://github.com";
export const ISSUE_REFERENCE = /\b(?:fixes|closes|resolves)\s+#(\d+)\b/gi;
export const PR_MERGE_REFERENCE = /Merge pull request #(\d+)|\(#(\d+)\)/g;
/** Captures the new path (the b/ side) from a `diff --git` header line. */
export const DIFF_FILE_HEADER = /^diff --git a\/.+? b\/(.+)$/gm;
/** Captures the old path (the a/ side) from a `diff --git` header line. */
export const DIFF_LEFT_PATH = /^diff --git a\/(.+?) b\//gm;
export const GLOB_SPECIAL_CHARS = ".+^${}()|[]\\";

// CLI
export const COMMANDS = ["describe", "changelog", "init"] as const;
export const DEFAULT_COMMAND = "describe";
export const DEFAULT_CHANGESET_BUMP_MINOR = "minor";
export const DEFAULT_CHANGESET_BUMP_PATCH = "patch";
export const DEFAULT_PACKAGE_JSON = "package.json";
export const CHANGES_DIR = ".changes";

// Small patterns used across modules (kept here so every regex has one home).
export const EVIDENCE_PREFIX = /^[ab]\//;
export const BULLET_PREFIX = /^[-*]\s+/;
export const BULLET_LINE = /^\s*[-*]\s+/;
export const BULLET_TEXT = /^\s*[-*]\s+(.+)/;
export const MARKDOWN_HEADING = /^## /;
export const SCOPE_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]*$/i;
export const WHITESPACE = /\s+/;
export const WORD_EDGE_START = /^[("'`[]+/;
export const WORD_EDGE_END = /[)"'`\].,;:!?]+$/;
export const CONSECUTIVE_BLANK_LINES = /\n{3,}/g;

// More patterns and literals, moved here so none live inside functions.
export const BACKSLASH_PATTERN = /\\/g;
export const TRAILING_SLASH = /\/$/;
export const FLAG_PREFIX = "--";
export const HTTP_NOT_FOUND = 404;
export const GGML_GPU_MODE = "auto";
export const GGML_THREADS = "auto";
export const GGML_NAME = "ggml-node";
export const MOCK_NAME = "mock";
export const CORE_SCOPE_FALLBACK = "core";
