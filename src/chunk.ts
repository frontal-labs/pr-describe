import type { Provider } from "./providers";

export interface Chunk {
  diff: string;
  files: string[];
  tokenEstimate: number;
}

export interface FileDiff {
  diff: string;
  path: string;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function countLines(text: string): number {
  return text.split("\n").length;
}

const MAX_REDUCE_ROUNDS = 3;

/**
 * Upper bound on summary model calls for one diff. Every call runs the local
 * model, and PR authors control the diff size, so this keeps a huge PR from
 * tying up the runner.
 */
export const MAX_SUMMARY_CALLS = 20;

/**
 * Split a list of file diffs into chunks that fit a token budget.
 *
 * If the whole diff fits the budget, a single chunk is returned.
 * Otherwise (with a provider), large diffs are reduced: each chunk is
 * summarized, the summaries are re-packed, and the process repeats until the
 * result fits in one chunk. Every chunk the caller receives is therefore
 * included in the final prompt. Throws if the diff still does not fit after
 * MAX_REDUCE_ROUNDS, rather than silently dropping content. Throws before
 * any model call if the first round needs more than MAX_SUMMARY_CALLS chunks,
 * and throws if later rounds exceed that total.
 *
 * Without a provider, the per-file budget packing is returned as-is.
 */
export async function chunkDiff(
  fileDiffs: FileDiff[],
  tokenBudget: number,
  largeThreshold: number,
  provider?: Provider
): Promise<Chunk[]> {
  const totalLines = fileDiffs.reduce((sum, f) => sum + countLines(f.diff), 0);
  const isLarge = totalLines > largeThreshold;

  const chunks = packChunks(fileDiffs, tokenBudget);

  if (!isLarge || chunks.length <= 1 || !provider) {
    return chunks;
  }

  if (chunks.length > MAX_SUMMARY_CALLS) {
    throw new Error(
      `Diff is too large to summarize: ${chunks.length} chunks need more than ${MAX_SUMMARY_CALLS} model calls`
    );
  }

  let current: FileDiff[] = chunks.map((c) => ({
    diff: c.diff,
    path: c.files.join(", "),
  }));

  let calls = 0;
  for (let round = 0; round < MAX_REDUCE_ROUNDS; round++) {
    const summaries: FileDiff[] = [];
    for (const chunk of packChunks(current, tokenBudget)) {
      calls++;
      if (calls > MAX_SUMMARY_CALLS) {
        throw new Error(
          `Diff is too large to summarize: more than ${MAX_SUMMARY_CALLS} model calls needed`
        );
      }
      const summary = await summarizeChunk(chunk, provider);
      summaries.push({ diff: summary, path: chunk.files.join(", ") });
    }
    const packed = packChunks(summaries, tokenBudget);
    if (packed.length <= 1) {
      return packed;
    }
    current = summaries;
  }

  throw new Error(
    `Diff could not be reduced to ${tokenBudget} tokens after ${MAX_REDUCE_ROUNDS} rounds`
  );
}

function packChunks(fileDiffs: FileDiff[], tokenBudget: number): Chunk[] {
  const chunks: Chunk[] = [];
  let current: FileDiff[] = [];
  let currentTokens = 0;

  for (const fd of fileDiffs) {
    const tokens = estimateTokens(fd.diff);
    if (currentTokens + tokens > tokenBudget && current.length > 0) {
      chunks.push(buildChunk(current));
      current = [];
      currentTokens = 0;
    }
    current.push(fd);
    currentTokens += tokens;
  }
  if (current.length > 0) {
    chunks.push(buildChunk(current));
  }
  return chunks;
}

async function summarizeChunk(
  chunk: Chunk,
  provider: Provider
): Promise<string> {
  const prompt =
    "Summarize the following code diff concisely. " +
    `Focus on what changed and why. Keep it under 200 words.\n\n${chunk.diff}`;
  const text = await provider.generateText({
    prompt,
    system: "You summarize code diffs concisely.",
  });
  return text.trim();
}

function buildChunk(fileDiffs: FileDiff[]): Chunk {
  const diff = fileDiffs.map((f) => f.diff).join("\n");
  return {
    diff,
    files: fileDiffs.map((f) => f.path),
    tokenEstimate: estimateTokens(diff),
  };
}
