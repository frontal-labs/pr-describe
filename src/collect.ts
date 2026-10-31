import { Octokit } from "@octokit/rest";
import {
  DIFF_FILE_HEADER,
  HTTP_NOT_FOUND,
  ISSUE_REFERENCE,
  PR_MERGE_REFERENCE,
  PR_TEMPLATE_PATH,
  RECORD_SCHEMA_VERSION,
} from "./constants";
import { env } from "./env";
import { extractMarkerBlock } from "./markers";
import { readTextFileSync, runGit } from "./runtime";
import {
  type ChangelogEntry,
  type ChangeRecord,
  ChangeRecordFieldsSchema,
  type CollectedData,
  type CollectOptions,
  CommitListSchema,
  CompareSchema,
  FileContentSchema,
  type FileDiff,
  HttpErrorSchema,
  PullRequestSchema,
  PullRequestSummarySchema,
} from "./types";
import { parseOrThrow } from "./validate";

/** The repository from options or GITHUB_REPOSITORY. Throws if neither is set. */
export function resolveRepo(options: { owner?: string; repo?: string }): {
  owner: string;
  repo: string;
} {
  const owner = options.owner ?? env.GITHUB_REPOSITORY?.split("/")[0];
  const repo = options.repo ?? env.GITHUB_REPOSITORY?.split("/")[1];
  if (!(owner && repo)) {
    throw new Error(
      "Could not determine owner/repo. Set GITHUB_REPOSITORY or pass --owner/--repo."
    );
  }
  return { owner, repo };
}

/** GitHub API client. `apiUrl` defaults to GITHUB_API_URL, then api.github.com. */
export function createOctokit(token?: string, apiUrl?: string): Octokit {
  const baseUrl = apiUrl ?? env.GITHUB_API_URL;
  return new Octokit({
    ...(token ? { auth: token } : {}),
    ...(baseUrl ? { baseUrl } : {}),
  });
}

export async function collectFromPR(
  options: CollectOptions
): Promise<CollectedData> {
  const token = options.token ?? env.GITHUB_TOKEN;
  if (options.prNumber) {
    const { owner, repo } = resolveRepo(options);
    return collectFromPRNumber(
      createOctokit(token, options.apiUrl),
      owner,
      repo,
      options.prNumber
    );
  }
  // Local ranges read git only, so they need no repository.
  return collectLocal(
    options,
    options.owner ?? env.GITHUB_REPOSITORY?.split("/")[0] ?? "",
    options.repo ?? env.GITHUB_REPOSITORY?.split("/")[1] ?? ""
  );
}

async function collectFromPRNumber(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<CollectedData> {
  const pr = parseOrThrow(
    PullRequestSchema,
    (await octokit.rest.pulls.get({ owner, pull_number: prNumber, repo })).data,
    `GitHub PR #${prNumber}`
  );
  const diffRes = await octokit.rest.pulls.get({
    mediaType: { format: "diff" },
    owner,
    pull_number: prNumber,
    repo,
  });
  const diff = typeof diffRes.data === "string" ? diffRes.data : "";

  const commits = parseOrThrow(
    CommitListSchema,
    (
      await octokit.rest.pulls.listCommits({
        owner,
        pull_number: prNumber,
        repo,
      })
    ).data,
    `GitHub commits for PR #${prNumber}`
  )
    .map((c) => c.commit.message)
    .filter(Boolean);

  const linked = new Set<string>();
  const allText = `${pr.title}\n${pr.body ?? ""}\n${commits.join("\n")}`;
  for (const m of allText.matchAll(ISSUE_REFERENCE)) {
    linked.add(`#${m[1]}`);
  }

  let prTemplate: string | null = null;
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      path: PR_TEMPLATE_PATH,
      repo,
    });
    const file = parseOrThrow(FileContentSchema, data, "PR template");
    prTemplate = Buffer.from(file.content, "base64").toString("utf-8");
  } catch {
    // No template in the repository.
  }

  return {
    author: pr.user?.login ?? "",
    base: pr.base.ref,
    body: pr.body ?? "",
    branch: pr.head.ref,
    commits,
    diff,
    fork: pr.head.repo ? pr.head.repo.owner.login !== owner : false,
    head: pr.head.sha,
    headOwner: pr.head.repo?.owner.login,
    issueNumbers: Array.from(linked),
    labels: pr.labels.map((l) => l.name),
    owner,
    prNumber,
    prTemplate,
    repo,
    title: pr.title,
  };
}

function collectLocal(
  options: CollectOptions,
  owner: string,
  repo: string
): CollectedData {
  const base = options.base ?? "main";
  const head = options.head ?? "HEAD";
  const diff = runGit(["diff", `${base}...${head}`]);
  const commitsRaw = runGit([
    "log",
    `${base}...${head}`,
    "--format=%s%n%b%n---COMMIT---",
  ]);
  const commits = commitsRaw
    .split("---COMMIT---")
    .map((c) => c.trim())
    .filter(Boolean);

  const title = commits[0] ?? "Untitled";
  const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  const linked = new Set<string>();
  for (const c of commits) {
    for (const m of c.matchAll(ISSUE_REFERENCE)) {
      linked.add(`#${m[1]}`);
    }
  }

  let prTemplate: string | null = null;
  try {
    prTemplate = readTextFileSync(PR_TEMPLATE_PATH);
  } catch {
    // No template in the working tree.
  }

  return {
    author: "",
    base,
    body: "",
    branch: branch.trim(),
    commits,
    diff,
    fork: false,
    head,
    issueNumbers: Array.from(linked),
    labels: [],
    owner,
    prTemplate,
    repo,
    title,
  };
}

/** Replace a PR's body. Requires a token with pull-requests write access. */
export async function updatePullRequestBody(options: {
  apiUrl?: string;
  body: string;
  owner: string;
  prNumber: number;
  repo: string;
  token?: string;
}): Promise<void> {
  const token = options.token ?? env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("Updating a PR needs GITHUB_TOKEN or --token");
  }
  await createOctokit(token, options.apiUrl).rest.pulls.update({
    body: options.body,
    owner: options.owner,
    pull_number: options.prNumber,
    repo: options.repo,
  });
}

/** PR numbers referenced by commit subjects: merge commits and "(#N)" squash suffixes. */
export function prNumbersFromMessages(messages: string[]): number[] {
  const found: number[] = [];
  for (const message of messages) {
    for (const m of message.matchAll(PR_MERGE_REFERENCE)) {
      const n = Number(m[1] ?? m[2]);
      if (!found.includes(n)) {
        found.push(n);
      }
    }
  }
  return found;
}

/**
 * Read the change records of the PRs merged between two refs. A PR without a
 * readable record block is reported in `missing`, not guessed at. GitHub's
 * compare API returns at most 250 commits.
 */
export async function listChangelogEntries(options: {
  apiUrl?: string;
  from: string;
  owner: string;
  repo: string;
  to: string;
  token?: string;
}): Promise<{ entries: ChangelogEntry[]; missing: number[] }> {
  const octokit = createOctokit(
    options.token ?? env.GITHUB_TOKEN,
    options.apiUrl
  );
  const { data } = await octokit.rest.repos.compareCommitsWithBasehead({
    basehead: `${options.from}...${options.to}`,
    owner: options.owner,
    repo: options.repo,
  });
  const compare = parseOrThrow(CompareSchema, data, "GitHub compare");
  const numbers = prNumbersFromMessages(
    compare.commits.map((c) => c.commit.message)
  );

  const entries: ChangelogEntry[] = [];
  const missing: number[] = [];
  for (const prNumber of numbers) {
    let summary: { body: string | null; title: string };
    try {
      const { data: pr } = await octokit.rest.pulls.get({
        owner: options.owner,
        pull_number: prNumber,
        repo: options.repo,
      });
      summary = parseOrThrow(
        PullRequestSummarySchema,
        pr,
        `GitHub PR #${prNumber}`
      );
    } catch (err) {
      // "(#N)" can also name an issue or another repo; that is not a missing record.
      if (HttpErrorSchema.safeParse(err).data?.status === HTTP_NOT_FOUND) {
        missing.push(prNumber);
        continue;
      }
      throw err;
    }
    const record = recordFromBody(summary.body ?? "");
    if (record) {
      entries.push({ prNumber, record, title: summary.title });
    } else {
      missing.push(prNumber);
    }
  }
  return { entries, missing };
}

/** The change record in a PR body's marker block, when it is present and valid. */
function recordFromBody(body: string): ChangeRecord | null {
  const block = extractMarkerBlock(body);
  if (!block?.recordJson) {
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(block.recordJson);
  } catch {
    return null;
  }
  const parsed = ChangeRecordFieldsSchema.safeParse(raw);
  return parsed.success
    ? { ...parsed.data, schema: RECORD_SCHEMA_VERSION }
    : null;
}

/** Parsed file diffs from a unified diff, for the filter and chunker. */
export function parseFileDiffs(diff: string): FileDiff[] {
  const files: FileDiff[] = [];
  const starts = [...diff.matchAll(DIFF_FILE_HEADER)];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i].index ?? 0;
    const end =
      i + 1 < starts.length
        ? (starts[i + 1].index ?? diff.length)
        : diff.length;
    files.push({ diff: diff.slice(start, end).trim(), path: starts[i][1] });
  }
  return files;
}
