import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chunkDiff } from "./core/chunk";
import { collectFromPR, parseFileDiffs } from "./core/collect";
import { loadConfig } from "./core/config-loader";
import { filterPaths } from "./core/filter";
import { generateDescription } from "./core/generate";
import {
  appendRegenerateCheckbox,
  extractMarkerBlock,
  isEdited,
  renderMarkerBlock,
  replaceOrInsertMarkerBlock,
} from "./core/markers";
import { env, getApiKey, isMockData } from "./env";
import { getProvider } from "./providers";

async function main() {
  const prNumber = Number(env.PR_NUMBER);
  const owner = env.GITHUB_REPOSITORY?.split("/")[0];
  const repo = env.GITHUB_REPOSITORY?.split("/")[1];
  const token = env.GITHUB_TOKEN;
  const config = await loadConfig();

  if (!(prNumber && owner && repo)) {
    console.error("PR_NUMBER and GITHUB_REPOSITORY required");
    process.exit(1);
  }

  const collected = await collectFromPR({ owner, prNumber, repo, token });
  const fileDiffs = filterPaths(parseFileDiffs(collected.diff), { config });
  const chunks = chunkDiff(fileDiffs, 4000, config.large_change_threshold);
  const providerName = isMockData() ? "mock" : config.provider;
  const provider = getProvider(providerName, {
    apiKey: getApiKey(config.api_key_env) ?? token,
    model: config.model,
  });

  const result = await generateDescription(provider, {
    body: collected.body,
    commits: collected.commits,
    config,
    diff: chunks[0].diff,
    issueNumbers: collected.issueNumbers,
    prTemplate: collected.prTemplate,
    title: collected.title,
  });

  const recordYaml = Object.entries(result.record)
    .filter(([k]) => k !== "schema")
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join("\n");
  const block = renderMarkerBlock(result.description, recordYaml);

  const existing = extractMarkerBlock(collected.body);
  let finalBody: string;
  if (existing && isEdited(collected.body, existing.hash)) {
    finalBody = appendRegenerateCheckbox(collected.body);
    console.log(
      "Edited block detected; preserving and adding regenerate checkbox"
    );
  } else {
    finalBody = replaceOrInsertMarkerBlock(collected.body, block);
  }

  const outDir = join(process.cwd(), ".frontal");
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }
  writeFileSync(join(outDir, "pr-body.md"), finalBody);
  writeFileSync(join(outDir, "record.yml"), recordYaml);
  writeFileSync(join(outDir, "description.md"), result.description);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
