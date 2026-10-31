import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  renderChangeset,
  renderGitHubRelease,
  renderMarkdown,
  renderSlackPayload,
} from "./changelog";
import { chunkDiff } from "./core/chunk";
import {
  collectFromPR,
  listChangelogEntries,
  parseFileDiffs,
  resolveRepo,
  updatePullRequestBody,
} from "./core/collect";
import { CONFIG_FILE, loadConfig } from "./core/config-loader";
import { filterPaths, hasSkipLabel } from "./core/filter";
import {
  filterClaimsByEvidence,
  type GenerateResult,
  generateDescription,
} from "./core/generate";
import {
  appendRegenerateCheckbox,
  extractMarkerBlock,
  isEdited,
  renderMarkerBlock,
  replaceOrInsertMarkerBlock,
} from "./core/markers";
import type { Audience } from "./core/record";
import { recordToJson } from "./core/record";
import { env, isMockData } from "./env";
import { getProvider } from "./providers";

interface CliArgs {
  _: string[];
  audience?: string;
  base?: string;
  dryRun?: boolean;
  force?: boolean;
  format?: string;
  from?: string;
  head?: string;
  owner?: string;
  package?: string;
  polish?: boolean;
  pr?: string;
  repo?: string;
  to?: string;
  token?: string;
  update?: boolean;
  writeFile?: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        (args as unknown as Record<string, unknown>)[key] = next;
        i++;
      } else {
        (args as unknown as Record<string, unknown>)[key] = true;
      }
    } else {
      args._.push(arg);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const command = args._[0] ?? "describe";

  if (command === "describe") {
    await describeCommand(args);
  } else if (command === "changelog") {
    await changelogCommand(args);
  } else if (command === "init") {
    await initCommand(args);
  } else {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }
}

function truncateWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) {
    return text.trim();
  }
  return `${words.slice(0, maxWords).join(" ")}...`;
}

async function describeCommand(args: CliArgs) {
  if (args.update && !args.pr) {
    console.error("--update needs --pr <number>");
    process.exit(1);
  }
  const config = await loadConfig();
  const token = args.token ?? env.GITHUB_TOKEN;

  const collected = await collectFromPR({
    base: args.base,
    head: args.head,
    owner: args.owner,
    prNumber: args.pr ? Number(args.pr) : undefined,
    repo: args.repo,
    token,
  });

  // Fork PRs are skipped by default: the Action would need pull_request_target
  // to read the base repo's secrets, which is a security tradeoff.
  if (collected.fork) {
    console.log(
      `Skipping PR #${collected.prNumber}: fork from ${collected.headOwner}/${collected.repo}. ` +
        "Fork PRs are not supported yet."
    );
    return;
  }

  if (hasSkipLabel(collected.labels, config.skip_labels)) {
    console.log("Skipping PR: has skip label");
    return;
  }

  const fileDiffs = filterPaths(parseFileDiffs(collected.diff), { config });
  if (fileDiffs.length === 0) {
    console.log("No non-ignored files in diff");
    return;
  }

  const providerName = isMockData() ? "mock" : config.provider;
  const provider = getProvider(providerName, {
    model: env.MODEL || config.model,
  });

  const totalLines = fileDiffs.reduce(
    (sum, f) => sum + f.diff.split("\n").length,
    0
  );
  const isLarge = totalLines > config.large_change_threshold;

  // The model stays loaded in this process, so dispose it on every path.
  let result: GenerateResult;
  try {
    const chunks = await chunkDiff(
      fileDiffs,
      4000,
      config.large_change_threshold,
      provider
    );
    result = await generateDescription(provider, {
      body: collected.body,
      commits: collected.commits,
      config,
      diff: chunks.map((c) => c.diff).join("\n"),
      issueNumbers: collected.issueNumbers,
      prTemplate: collected.prTemplate,
      title: collected.title,
    });
  } finally {
    await provider.dispose();
  }

  const filtered = filterClaimsByEvidence(result.record, result.description);
  const description = isLarge
    ? filtered.description
    : truncateWords(filtered.description, 250);

  const recordJson = recordToJson(filtered.record);
  const block = renderMarkerBlock(description, recordJson);

  const existing = extractMarkerBlock(collected.body);
  const edited = Boolean(existing && isEdited(collected.body, existing.hash));
  // A human edit inside the marker block is kept. The body only gets a
  // "Regenerate description" checkbox, and nothing is regenerated.
  const bodyToSave = edited
    ? appendRegenerateCheckbox(collected.body)
    : replaceOrInsertMarkerBlock(collected.body, block);

  if (edited) {
    console.log(
      "PR description was edited by human; preserving changes and adding regenerate checkbox"
    );
  } else {
    console.log("=== Generated PR description ===");
    console.log(description);
    console.log("=== Change record ===");
    console.log(JSON.stringify(filtered.record, null, 2));

    if (args.writeFile) {
      const prNum = args.pr ?? "local";
      const dir = join(process.cwd(), ".changes");
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(join(dir, `${prNum}.json`), `${recordJson}\n`);
    }
  }

  if (args.update && args.dryRun) {
    console.log("Dry run: PR not updated");
    return;
  }
  if (args.update) {
    await updatePullRequestBody({
      body: bodyToSave,
      owner: collected.owner,
      prNumber: collected.prNumber as number,
      repo: collected.repo,
      token,
    });
    console.log(`Updated PR #${collected.prNumber}`);
    return;
  }
  if (!args.dryRun) {
    console.log("\n--- New PR body (with markers) ---");
    console.log(bodyToSave);
  }
}

const CHANGELOG_RENDERERS = {
  changeset: renderChangeset,
  "github-release": renderGitHubRelease,
  markdown: renderMarkdown,
  slack: renderSlackPayload,
} as const;

async function changelogCommand(args: CliArgs) {
  const { from, to } = args;
  if (!(from && to)) {
    console.error("changelog needs --from <tag> and --to <tag>");
    process.exit(1);
  }
  const format = (args.format ??
    "markdown") as keyof typeof CHANGELOG_RENDERERS;
  if (!(format in CHANGELOG_RENDERERS)) {
    console.error(
      `Unknown format: ${format}. Use one of: ${Object.keys(CHANGELOG_RENDERERS).join(", ")}`
    );
    process.exit(1);
  }
  const { owner, repo } = resolveRepo(args);
  const { entries, missing } = await listChangelogEntries({
    from,
    owner,
    repo,
    to,
    token: args.token ?? env.GITHUB_TOKEN,
  });

  console.log(
    CHANGELOG_RENDERERS[format](entries, {
      audience: args.audience as Audience | undefined,
      format: format as "markdown",
      from,
      packageName: args.package ?? readPackageName(),
      repoUrl: `https://github.com/${owner}/${repo}`,
      to,
    })
  );
  if (missing.length > 0) {
    console.error(
      `No change record found in the PR body for: ${missing.map((n) => `#${n}`).join(", ")}`
    );
  }
}

function readPackageName(): string | undefined {
  const path = join(process.cwd(), "package.json");
  if (!existsSync(path)) {
    return undefined;
  }
  try {
    return (JSON.parse(readFileSync(path, "utf-8")) as { name?: string }).name;
  } catch {
    return undefined;
  }
}

async function initCommand(args: CliArgs) {
  const path = join(process.cwd(), CONFIG_FILE);
  if (existsSync(path) && !args.force) {
    console.error(
      `${CONFIG_FILE} already exists. Pass --force to overwrite it.`
    );
    process.exit(1);
  }
  const template = {
    ignore: ["**/*.snap", "dist/**"],
    model: "qwen2.5-1.5b",
    provider: "ggml-node",
    scopes: {
      billing: ["src/billing/**"],
      ui: ["src/components/**"],
    },
    sections: ["summary", "changes", "testing", "risks"],
    skip_labels: ["dependencies", "skip-describe"],
  };
  writeFileSync(path, `${JSON.stringify(template, null, 2)}\n`);
  console.log(`Wrote ${CONFIG_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
