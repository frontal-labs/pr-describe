import { chunkDiff } from "./chunk";
import {
  type CollectedData,
  type CollectOptions,
  parseFileDiffs,
} from "./collect";
import type { ResolvedConfig } from "./config";
import { filterPaths, hasSkipLabel } from "./filter";
import { type GenerateResult, generateDescription } from "./generate";
import {
  appendRegenerateCheckbox,
  extractMarkerBlock,
  isEdited,
  renderMarkerBlock,
  replaceOrInsertMarkerBlock,
} from "./markers";
import type { Provider } from "./providers";
import { recordToJson } from "./record";

/** Token budget for one prompt's diff. */
export const PROMPT_BUDGET_TOKENS = 4000;
/** Descriptions of small diffs are cut to this many words. */
export const SHORT_DESCRIPTION_WORDS = 250;

export interface DescribeDeps {
  collect: (options: CollectOptions) => Promise<CollectedData>;
  provider: Provider;
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
      record: GenerateResult["record"];
      recordJson: string;
      review: string[];
      target: DescribeTarget;
    };

/**
 * Run the describe pipeline. Pure orchestration: the GitHub client and the
 * model are injected, so this runs in tests without a network or a model.
 * The caller owns the provider and must dispose it.
 */
export async function runDescribe(
  input: { collect: CollectOptions; config: ResolvedConfig },
  deps: DescribeDeps
): Promise<DescribeOutcome> {
  const collected = await deps.collect(input.collect);
  const target: DescribeTarget = {
    owner: collected.owner,
    prNumber: collected.prNumber,
    repo: collected.repo,
  };

  // Fork PRs are skipped by default: the Action would need pull_request_target
  // to read the base repo's secrets, which is a security tradeoff.
  if (collected.fork) {
    return {
      reason: `fork from ${collected.headOwner}/${collected.repo}; fork PRs are not supported yet`,
      status: "skipped",
      target,
    };
  }
  if (hasSkipLabel(collected.labels, input.config.skip_labels)) {
    return { reason: "has skip label", status: "skipped", target };
  }

  const files = filterPaths(parseFileDiffs(collected.diff), {
    config: input.config,
  });
  if (files.length === 0) {
    return {
      reason: "no non-ignored files in diff",
      status: "skipped",
      target,
    };
  }

  // A human edit inside the marker block is kept as is. The body only gets a
  // "Regenerate description" checkbox, so there is nothing to generate.
  const existing = extractMarkerBlock(collected.body);
  if (existing && isEdited(collected.body, existing.hash)) {
    return {
      body: appendRegenerateCheckbox(collected.body),
      status: "edited",
      target,
    };
  }

  const totalLines = files.reduce(
    (sum, f) => sum + f.diff.split("\n").length,
    0
  );
  const isLarge = totalLines > input.config.large_change_threshold;
  const chunks = await chunkDiff(
    files,
    PROMPT_BUDGET_TOKENS,
    input.config.large_change_threshold,
    deps.provider
  );
  const result = await generateDescription(deps.provider, {
    body: collected.body,
    commits: collected.commits,
    config: input.config,
    files,
    issueNumbers: collected.issueNumbers,
    promptDiff: chunks.map((c) => c.diff).join("\n"),
    prTemplate: collected.prTemplate,
    title: collected.title,
  });

  const description = isLarge
    ? result.description
    : truncateWords(result.description, SHORT_DESCRIPTION_WORDS);
  const recordJson = recordToJson(result.record);
  const block = renderMarkerBlock(description, recordJson);
  return {
    body: replaceOrInsertMarkerBlock(collected.body, block),
    description,
    droppedSentences: result.droppedSentences,
    record: result.record,
    recordJson,
    review: result.review,
    status: "generated",
    target,
  };
}

export function truncateWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) {
    return text.trim();
  }
  return `${words.slice(0, maxWords).join(" ")}...`;
}
