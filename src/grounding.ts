// Deterministic checks that keep generated text tied to the input. The model
// may paraphrase, but every concrete claim (a path, a backticked identifier, a
// number) must appear in the diff, the commits or the PR text.

export interface FileChange {
  added: number;
  path: string;
  removed: number;
}

/** Per-file line counts from unified diff text. */
export function fileChanges(
  files: Array<{ diff: string; path: string }>
): FileChange[] {
  return files.map((f) => {
    let added = 0;
    let removed = 0;
    for (const line of f.diff.split("\n")) {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        added++;
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        removed++;
      }
    }
    return { added, path: f.path, removed };
  });
}

const MAX_LISTED_FILES = 50;

/** One bullet per changed file, written by code. */
export function changesLines(files: FileChange[]): string[] {
  const lines = files
    .slice(0, MAX_LISTED_FILES)
    .map((f) => `\`${f.path}\` (+${f.added} −${f.removed})`);
  if (files.length > MAX_LISTED_FILES) {
    lines.push(`…and ${files.length - MAX_LISTED_FILES} more files`);
  }
  return lines;
}

const PATH_EXTENSION =
  /\.(ts|tsx|js|jsx|mjs|cjs|json|ya?ml|md|mdx|go|py|rs|java|kt|rb|sh|css|scss|html|toml|lock|snap|sql|proto|graphql)$/i;

/** Claims a sentence makes that can be checked against the input. */
export function claimTokens(text: string): string[] {
  const tokens = new Set<string>();
  for (const m of text.matchAll(/`([^`]+)`/g)) {
    tokens.add(m[1].trim());
  }
  for (const word of text.split(/\s+/)) {
    const cleaned = word.replace(/^[("'`[]+|[)"'`\].,;:!?]+$/g, "");
    if (cleaned.includes("/") || PATH_EXTENSION.test(cleaned)) {
      tokens.add(cleaned);
    }
  }
  for (const m of text.matchAll(/\b\d{2,}\b/g)) {
    tokens.add(m[0]);
  }
  tokens.delete("");
  return [...tokens];
}

/** True when the token appears in the source text, ignoring case. */
export function isGrounded(token: string, source: string): boolean {
  return source.toLowerCase().includes(token.toLowerCase());
}

/**
 * Keep the sentences whose claims are all grounded in the source. Returns the
 * kept text and how many sentences were dropped.
 */
export function groundSentences(
  text: string,
  source: string
): { dropped: number; text: string } {
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const kept = sentences.filter((s) =>
    claimTokens(s).every((t) => isGrounded(t, source))
  );
  return { dropped: sentences.length - kept.length, text: kept.join(" ") };
}

/** A test file was changed, or the PR text talks about tests. */
export function hasTestSignal(paths: string[], prText: string): boolean {
  return (
    paths.some((p) =>
      /(^|\/)(__tests__|tests?|spec)\/|\.(test|spec)\.[a-z]+$/i.test(p)
    ) || /\btests?\b|\bspec\b|\bqa\b/i.test(prText)
  );
}

/** A change that often carries risk: migrations, schemas, config, or an explicit breaking marker. */
export function hasRiskSignal(paths: string[], prText: string): boolean {
  return (
    paths.some((p) =>
      /(^|\/)(migrations?|config)\/|\.sql$|\.env|schema\./i.test(p)
    ) || /\b(breaking|migration|deprecat\w*|rollback)\b/i.test(prText)
  );
}
