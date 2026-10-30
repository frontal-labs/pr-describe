import { Octokit } from "@octokit/rest";
import { env } from "../env";
import { readTextFileSync, runGit } from "../runtime";

export interface CollectedData {
  owner: string;
  repo: string;
  prNumber?: number;
  title: string;
  body: string;
  branch: string;
  base: string;
  head: string;
  diff: string;
  commits: string[];
  issueNumbers: string[];
  prTemplate: string | null;
  labels: string[];
  author: string;
}

export interface CollectOptions {
  owner?: string;
  repo?: string;
  prNumber?: number;
  base?: string;
  head?: string;
  token?: string;
}

const ISSUE_PATTERN = /\b(?:fixes|closes|resolves)\s+#(\d+)\b/gi;

export async function collectFromPR(
  options: CollectOptions
): Promise<CollectedData> {
  const token = options.token ?? env.GITHUB_TOKEN;
  const owner = options.owner ?? env.GITHUB_REPOSITORY?.split("/")[0];
  const repo = options.repo ?? env.GITHUB_REPOSITORY?.split("/")[1];
  if (!(owner && repo)) {
    throw new Error(
      "Could not determine owner/repo. Set GITHUB_REPOSITORY or pass --owner/--repo."
    );
  }

  const octokit = token ? new Octokit({ auth: token }) : new Octokit();

  if (options.prNumber) {
    return collectFromPRNumber(octokit, owner, repo, options.prNumber);
  }
  return collectLocal(options, owner, repo);
}

async function collectFromPRNumber(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<CollectedData> {
  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });
  const { data: diffRes } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
    mediaType: { format: "diff" },
  });
  const diff = typeof diffRes === "string" ? diffRes : "";

  const { data: commitsRes } = await octokit.rest.pulls.listCommits({
    owner,
    repo,
    pull_number: prNumber,
  });
  const commits = commitsRes.map((c) => c.commit.message).filter(Boolean);

  const linked = new Set<string>();
  const allText = `${pr.title}\n${pr.body ?? ""}\n${commits.join("\n")}`;
  for (const m of allText.matchAll(ISSUE_PATTERN)) {
    linked.add(`#${m[1]}`);
  }

  let prTemplate: string | null = null;
  try {
    const { data: templateRes } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: ".github/PULL_REQUEST_TEMPLATE.md",
    });
    if ("content" in templateRes && templateRes.content) {
      prTemplate = Buffer.from(templateRes.content, "base64").toString("utf-8");
    }
  } catch {
    // no template
  }

  return {
    owner,
    repo,
    prNumber,
    title: pr.title,
    body: pr.body ?? "",
    branch: pr.head.ref,
    base: pr.base.ref,
    head: pr.head.sha,
    diff,
    commits,
    issueNumbers: Array.from(linked),
    prTemplate,
    labels: pr.labels.map((l) => l.name),
    author: pr.user?.login ?? "",
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
    for (const m of c.matchAll(ISSUE_PATTERN)) {
      linked.add(`#${m[1]}`);
    }
  }

  let prTemplate: string | null = null;
  try {
    prTemplate = readTextFileSync(".github/PULL_REQUEST_TEMPLATE.md");
  } catch {
    // no template
  }

  return {
    owner,
    repo,
    title,
    body: "",
    branch: branch.trim(),
    base,
    head,
    diff,
    commits,
    issueNumbers: Array.from(linked),
    prTemplate,
    labels: [],
    author: "",
  };
}

export function parseFileDiffs(
  diff: string
): Array<{ path: string; diff: string }> {
  const files: Array<{ path: string; diff: string }> = [];
  const parts = diff.split(/(?=^diff --git )/m);
  for (const part of parts) {
    const match = /^diff --git a\/(.+) b\/(.+)$/m.exec(part);
    if (!match) {
      continue;
    }
    const path = match[2];
    files.push({ path, diff: part.trim() });
  }
  return files;
}
