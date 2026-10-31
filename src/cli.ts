import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chunkDiff } from "./core/chunk";
import { collectFromPR, parseFileDiffs } from "./core/collect";
import { loadConfig } from "./core/config-loader";
import { filterPaths, hasSkipLabel } from "./core/filter";
import {
	type GenerateResult,
	filterClaimsByEvidence,
	generateDescription,
} from "./core/generate";
import {
  appendRegenerateCheckbox,
  extractMarkerBlock,
  isEdited,
  renderMarkerBlock,
  replaceOrInsertMarkerBlock,
} from "./core/markers";
import { env, isMockData } from "./env";
import { getProvider } from "./providers";

interface CliArgs {
  _: string[];
  audience?: string;
  base?: string;
  dryRun?: boolean;
  format?: string;
  from?: string;
  head?: string;
  owner?: string;
  polish?: boolean;
  pr?: string;
  repo?: string;
  to?: string;
  token?: string;
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
	if (words.length <= maxWords) return text.trim();
	return `${words.slice(0, maxWords).join(" ")}...`;
}

async function describeCommand(args: CliArgs) {
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
				"Set pull_request_target in .github/workflows/ to enable forks (see docs/).",
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
		0,
	);
	const isLarge = totalLines > config.large_change_threshold;

	// The model stays loaded in this process, so dispose it on every path.
	let result: GenerateResult;
	try {
		const chunks = await chunkDiff(
			fileDiffs,
			4000,
			config.large_change_threshold,
			provider,
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

	const recordYaml = Object.entries(filtered.record)
		.filter(([k]) => k !== "schema")
		.map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
		.join("\n");
	const block = renderMarkerBlock(description, recordYaml);

	const existing = extractMarkerBlock(collected.body);
	if (existing && isEdited(collected.body, existing.hash)) {
		const updated = appendRegenerateCheckbox(collected.body);
		console.log(
			"PR description was edited by human; preserving changes and adding regenerate checkbox",
		);
		if (!args.dryRun) {
			console.log(updated);
		}
		return;
	}

	const newBody = replaceOrInsertMarkerBlock(collected.body, block);
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
		writeFileSync(join(dir, `${prNum}.yml`), recordYaml);
	}

	if (!args.dryRun) {
		console.log("\n--- New PR body (with markers) ---");
		console.log(newBody);
	}
}

async function changelogCommand(args: CliArgs) {
  console.log(`changelog --from ${args.from} --to ${args.to} (stub)`);
}

async function initCommand(_args: CliArgs) {
  const template = `provider: ggml-node
model: qwen2.5-1.5b
sections: [summary, changes, testing, risks]
tone: concise
scopes:
  billing: ["src/billing/**"]
  ui: ["src/components/**"]
ignore: ["**/*.snap", "dist/**"]
skip_labels: [dependencies, skip-describe]
max_diff_lines: 4000
`;
  const dir = join(process.cwd(), ".frontal");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(join(dir, "pr-describe.yml"), template);
  console.log("Wrote .frontal/pr-describe.yml");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
