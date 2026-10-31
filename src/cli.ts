import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { commandOf, on, parseArgs, parseUsage, value } from "./args";
import { renderChangelog } from "./changelog";
import {
  collectFromPR,
  listChangelogEntries,
  resolveRepo,
  updatePullRequestBody,
} from "./collect";
import {
  CHANGES_DIR,
  CONFIG_FILE,
  DEFAULT_CHANGELOG_FORMAT,
  DEFAULT_MODEL,
  DEFAULT_PACKAGE_JSON,
  DEFAULT_PROVIDER,
  DEFAULT_SECTIONS,
  GITHUB_WEB_URL,
} from "./constants";
import { runDescribe } from "./describe";
import { env, isMockData } from "./env";
import { loadConfig } from "./loader";
import { getProvider } from "./providers";
import {
  ChangelogArgsSchema,
  type Cli,
  ConfigSchema,
  DescribeArgsSchema,
  type DescribeOutcome,
  InitArgsSchema,
  PackageJsonSchema,
  type Provider,
  type ResolvedConfig,
} from "./types";
import { UsageError } from "./validate";

async function main(argv: string[]): Promise<number> {
  const cli = parseArgs(argv);
  try {
    switch (commandOf(cli)) {
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
  } catch (err: unknown) {
    // Expected problems print as a message. Anything else is a bug: show the stack.
    console.error(err instanceof UsageError ? err.message : err);
    return 1;
  }
}

async function describeCommand(cli: Cli): Promise<void> {
  const args = parseUsage(DescribeArgsSchema, {
    base: value(cli, "base"),
    dryRun: on(cli, "dry-run"),
    head: value(cli, "head"),
    owner: value(cli, "owner"),
    pr: parsePrFlag(value(cli, "pr")),
    repo: value(cli, "repo"),
    token: value(cli, "token"),
    update: on(cli, "update"),
    writeFile: on(cli, "write-file"),
  });

  const config = await loadConfig();
  const token = args.token ?? env.GITHUB_TOKEN;
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
          base: args.base,
          head: args.head,
          owner: args.owner,
          prNumber: args.pr,
          repo: args.repo,
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
    if (args.writeFile) {
      writeRecord(`${args.pr ?? "local"}.json`, outcome.recordJson);
    }
  }

  if (args.update && args.dryRun) {
    console.log("Dry run: PR not updated");
    return;
  }
  if (args.update && args.pr !== undefined) {
    await updatePullRequestBody({
      body: outcome.body,
      owner: outcome.target.owner,
      prNumber: args.pr,
      repo: outcome.target.repo,
      token,
    });
    console.log(`Updated PR #${args.pr}`);
    return;
  }
  if (!args.dryRun) {
    console.log("\n--- New PR body (with markers) ---");
    console.log(outcome.body);
  }
}

/** `--pr` as a number. Anything that is not a number stays NaN so the schema reports it. */
function parsePrFlag(raw: string | undefined): number | undefined {
  return raw === undefined ? undefined : Number(raw);
}

function writeRecord(fileName: string, json: string): void {
  const dir = join(process.cwd(), CHANGES_DIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(join(dir, fileName), `${json}\n`);
}

async function changelogCommand(cli: Cli): Promise<void> {
  const args = parseUsage(ChangelogArgsSchema, {
    audience: value(cli, "audience"),
    format: value(cli, "format") ?? DEFAULT_CHANGELOG_FORMAT,
    from: value(cli, "from"),
    owner: value(cli, "owner"),
    package: value(cli, "package"),
    repo: value(cli, "repo"),
    to: value(cli, "to"),
    token: value(cli, "token"),
  });
  const { owner, repo } = resolveRepo({ owner: args.owner, repo: args.repo });
  const { entries, missing } = await listChangelogEntries({
    from: args.from,
    owner,
    repo,
    to: args.to,
    token: args.token ?? env.GITHUB_TOKEN,
  });

  console.log(
    renderChangelog(args.format, entries, {
      audience: args.audience,
      format: args.format,
      from: args.from,
      packageName: args.package ?? readPackageName(),
      repoUrl: `${GITHUB_WEB_URL}/${owner}/${repo}`,
      to: args.to,
    })
  );
  if (missing.length > 0) {
    console.error(
      `No change record found in the PR body for: ${missing.map((n) => `#${n}`).join(", ")}`
    );
  }
}

function readPackageName(): string | undefined {
  const path = join(process.cwd(), DEFAULT_PACKAGE_JSON);
  if (!existsSync(path)) {
    return undefined;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return undefined;
  }
  const parsed = PackageJsonSchema.safeParse(raw);
  return parsed.success ? parsed.data.name : undefined;
}

function initCommand(cli: Cli): void {
  const args = parseUsage(InitArgsSchema, { force: on(cli, "force") });
  const path = join(process.cwd(), CONFIG_FILE);
  if (existsSync(path) && !args.force) {
    throw new UsageError(
      `${CONFIG_FILE} already exists. Pass --force to overwrite it.`
    );
  }
  const template: ResolvedConfig = ConfigSchema.parse({
    model: DEFAULT_MODEL,
    provider: DEFAULT_PROVIDER,
    scopes: {
      billing: ["src/billing/**"],
      ui: ["src/components/**"],
    },
    sections: [...DEFAULT_SECTIONS],
    skip_labels: ["dependencies", "skip-describe"],
  });
  writeFileSync(path, `${JSON.stringify(template, null, 2)}\n`);
  console.log(`Wrote ${CONFIG_FILE}`);
}

const code = await main(process.argv.slice(2));
process.exitCode = code;
