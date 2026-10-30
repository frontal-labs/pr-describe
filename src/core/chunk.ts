export interface Chunk {
  files: string[];
  diff: string;
  tokenEstimate: number;
}

export interface FileDiff {
  path: string;
  diff: string;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function chunkDiff(
  fileDiffs: FileDiff[],
  tokenBudget: number,
  largeThreshold: number
): Chunk[] {
  const totalLines = fileDiffs.reduce((sum, f) => sum + countLines(f.diff), 0);
  const isLarge = totalLines > largeThreshold;

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

  if (isLarge && chunks.length > 1) {
    return summarizeChunk(chunks, fileDiffs, tokenBudget);
  }
  return chunks;
}

function summarizeChunk(
  chunks: Chunk[],
  fileDiffs: FileDiff[],
  tokenBudget: number
): Chunk[] {
  const summaries = chunks.map((c) => ({
    path: c.files.join(", "),
    diff: c.diff,
  }));
  const combined = summaries
    .map((s) => `### ${s.path}\n${s.diff}`)
    .join("\n\n");
  const estimate = estimateTokens(combined);
  if (estimate <= tokenBudget) {
    return [
      {
        files: fileDiffs.map((f) => f.path),
        diff: combined,
        tokenEstimate: estimate,
      },
    ];
  }
  return chunks;
}

function buildChunk(fileDiffs: FileDiff[]): Chunk {
  const diff = fileDiffs.map((f) => f.diff).join("\n");
  return {
    files: fileDiffs.map((f) => f.path),
    diff,
    tokenEstimate: estimateTokens(diff),
  };
}

function countLines(text: string): number {
  return text.split("\n").length;
}
