import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Cli, on, parseArgs, UsageError, value } from "./args";
import { CHANGELOG_FORMATS, renderChangelog } from "./changelog";
import {
  collectFromPR,
  listChangelogEntries,
  resolveRepo,
  updatePullRequestBody,
} from "./collect";
import { type DescribeOutcome, runDescribe } from "./describe";
import { env, isMockData } from "./env";
import { CONFIG_FILE, loadConfig } from "./loader";
import { getProvider, type Provider } from "./providers";
import { type Audience, VALID_AUDIENCES } from "./record";

async function main(argv: string[]): Promise<number> {
  const cli = parseArgs(argv);
  try {
    switch (cli.command) {
      case "describe":
        await describeCommand(cli);
        return 0;
      case "changelog":
        await changelogCommand(cli);
        return 0;
      case "init":
        initCommand(cli);
        return 0;
      default:
        throw new UsageError(`Unknown command: ${cli.command}`);
    }
  } catch (err) {
    if (err instanceof UsageError) {
      console.error(err.message);
      return 1;
    }
    console.error(err);
    return 1;
  }
}

async function describeCommand(cli: Cli): Promise<void> {
  const update = on(cli, "update");
  const dryRun = on(cli, "dry-run");
  const prFlag = value(cli, "pr");
  const prNumber = prFlag === undefined ? undefined : Number(prFlag);
  if (update && prNumber === undefined) {
    throw new UsageError("--update needs --pr <number>");
  }
  if (prNumber !== undefined && !Number.isInteger(prNumber)) {
    throw new UsageError(`--pr must be a number, got "${prFlag}"`);
  }

  const config = await loadConfig();
  const token = value(cli, "token") ?? env.GITHUB_TOKEN;
  const provider: Provider = getProvider(
    isMockData() ? "mock" : config.provider,
    {
      model: env.MODEL || config.model,
    }
  );

  let outcome: DescribeOutcome;
  try {
    outcome = await runDescribe(
      {
        collect: {
          base: value(cli, "base"),
          head: value(cli, "head"),
          owner: value(cli, "owner"),
          prNumber,
          repo: value(cli, "repo"),
          token,
        },
        config,
      },
      { collect: collectFromPR, provider }
    );
  } finally {
    // The model stays loaded in this process, so release it on every path.
    await provider.dispose();
  }

  if (outcome.status === "skipped") {
    console.log(`Skipping: ${outcome.reason}`);
    return;
  }

  if (outcome.status === "edited") {
    console.log(
      "PR description was edited by human; preserving changes and adding regenerate checkbox"
    );
  } else {
    console.log("=== Generated PR description ===");
    console.log(outcome.description);
    console.log("=== Change record ===");
    console.log(JSON.stringify(outcome.record, null, 2));
    if (outcome.review.length > 0) {
      console.log(`Needs review: ${outcome.review.join(" and ")}`);
    }
    if (outcome.droppedSentences > 0) {
      console.log(
        `Dropped ${outcome.droppedSentences} sentence(s) that were not grounded in the input`
      );
    }
    if (on(cli, "write-file")) {
      writeRecord(`${prNumber ?? "local"}.json`, outcome.recordJson);
    }
  }

  if (update && dryRun) {
    console.log("Dry run: PR not updated");
    return;
  }
  if (update) {
    await updatePullRequestBody({
      body: outcome.body,
      owner: outcome.target.owner,
      prNumber: outcome.target.prNumber as number,
      repo: outcome.target.repo,
      token,
    });
    console.log(`Updated PR #${outcome.target.prNumber}`);
    return;
  }
  if (!dryRun) {
    console.log("\n--- New PR body (with markers) ---");
    console.log(outcome.body);
  }
}

function writeRecord(fileName: string, json: string): void {
  const dir = join(process.cwd(), ".changes");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(join(dir, fileName), `${json}\n`);
}

async function changelogCommand(cli: Cli): Promise<void> {
  const from = value(cli, "from");
  const to = value(cli, "to");
  if (!(from && to)) {
    throw new UsageError("changelog needs --from <tag> and --to <tag>");
  }
  const requested = value(cli, "format") ?? "markdown";
  const format = CHANGELOG_FORMATS.find((f) => f === requested);
  if (!format) {
    throw new UsageError(
      `Unknown format: ${requested}. Use one of: ${CHANGELOG_FORMATS.join(", ")}`
    );
  }
  const { owner, repo } = resolveRepo({
    owner: value(cli, "owner"),
    repo: value(cli, "repo"),
  });
  const { entries, missing } = await listChangelogEntries({
    from,
    owner,
    repo,
    to,
    token: value(cli, "token") ?? env.GITHUB_TOKEN,
  });

  console.log(
    renderChangelog(format, entries, {
      audience: audienceFlag(cli),
      format,
      from,
      packageName: value(cli, "package") ?? readPackageName(),
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

function audienceFlag(cli: Cli): Audience | undefined {
  const requested = value(cli, "audience");
  if (requested === undefined) {
    return undefined;
  }
  const audience = VALID_AUDIENCES.find((a) => a === requested);
  if (!audience) {
    throw new UsageError(
      `Unknown audience: ${requested}. Use one of: ${VALID_AUDIENCES.join(", ")}`
    );
  }
  return audience;
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

function initCommand(cli: Cli): void {
  const path = join(process.cwd(), CONFIG_FILE);
  if (existsSync(path) && !on(cli, "force")) {
    throw new UsageError(
      `${CONFIG_FILE} already exists. Pass --force to overwrite it.`
    );
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

const code = await main(process.argv.slice(2));
process.exitCode = code;
