// Deterministic checks that keep generated text tied to the input. The model
// may paraphrase, but every concrete claim (a path, a backticked identifier, a
// number) must appear in the diff, the commits or the PR text.
import {
  BACKTICK_PATTERN,
  MAX_LISTED_FILES,
  NUMBER_PATTERN,
  PATH_EXTENSION,
  RISK_SIGNAL_PATH,
  RISK_SIGNAL_TEXT,
  SENTENCE_BREAK,
  TEST_SIGNAL_PATH,
  TEST_SIGNAL_TEXT,
  WHITESPACE,
  WORD_EDGE_END,
  WORD_EDGE_START,
} from "./constants";
import type { FileChange, FileDiff } from "./types";

/** Per-file line counts from unified diff text. */
export function fileChanges(
  files: Pick<FileDiff, "diff" | "path">[]
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

/** Claims a sentence makes that can be checked against the input. */
export function claimTokens(text: string): string[] {
  const tokens = new Set<string>();
  for (const m of text.matchAll(BACKTICK_PATTERN)) {
    tokens.add(m[1].trim());
  }
  for (const word of text.split(WHITESPACE)) {
    const cleaned = word
      .replace(WORD_EDGE_START, "")
      .replace(WORD_EDGE_END, "");
    if (cleaned.includes("/") || PATH_EXTENSION.test(cleaned)) {
      tokens.add(cleaned);
    }
  }
  for (const m of text.matchAll(NUMBER_PATTERN)) {
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
    .split(SENTENCE_BREAK)
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
    paths.some((p) => TEST_SIGNAL_PATH.test(p)) || TEST_SIGNAL_TEXT.test(prText)
  );
}

/** A change that often carries risk: migrations, schemas, config, or an explicit breaking marker. */
export function hasRiskSignal(paths: string[], prText: string): boolean {
  return (
    paths.some((p) => RISK_SIGNAL_PATH.test(p)) || RISK_SIGNAL_TEXT.test(prText)
  );
}
