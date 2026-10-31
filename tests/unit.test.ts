import { describe, expect, it } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { on, parseArgs, value } from "../src/args";
import { renderChangeset, renderMarkdown } from "../src/changelog";
import { chunkDiff, estimateTokens } from "../src/chunk";
import { prNumbersFromMessages } from "../src/collect";
import {
  CONFIG_FILE,
  CONTEXT_SIZE,
  DEFAULT_MODEL,
  MAX_SUMMARY_CALLS,
} from "../src/constants";
import { runDescribe } from "../src/describe";
import { filterPaths, hasSkipLabel, matchGlob } from "../src/filter";
import {
  changedPaths,
  generateDescription,
  resolveScope,
  typeFromPaths,
} from "../src/generate";
import {
  fileChanges,
  groundSentences,
  hasRiskSignal,
  hasTestSignal,
} from "../src/grounding";
import { DEFAULT_CONFIG, loadConfig, parseConfig } from "../src/loader";
import {
  appendRegenerateCheckbox,
  extractMarkerBlock,
  hashContent,
  isEdited,
  renderMarkerBlock,
  replaceOrInsertMarkerBlock,
} from "../src/markers";
import { getProvider, resolveModel } from "../src/providers";
import { recordToJson } from "../src/record";
import {
  type ChangeRecord,
  ChangeRecordFieldsSchema,
  ChangeRecordSchema,
  type DescribeOutcome,
  ModelOutputSchema,
  type Provider,
  type ResolvedConfig,
} from "../src/types";

describe("filter", () => {
  it("ignores lockfiles", () => {
    expect(matchGlob("bun.lock", "**/bun.lock")).toBe(true);
    expect(matchGlob("package-lock.json", "**/package-lock.json")).toBe(true);
    expect(matchGlob("yarn.lock", "**/yarn.lock")).toBe(true);
    expect(matchGlob("pnpm-lock.yaml", "**/pnpm-lock.yaml")).toBe(true);
  });

  it("ignores dist and snapshots", () => {
    expect(matchGlob("dist/index.js", "**/dist/**")).toBe(true);
    expect(matchGlob("src/foo.snap", "**/*.snap")).toBe(true);
    expect(matchGlob("vendor/lib.js", "**/vendor/**")).toBe(true);
  });

  it("keeps source files", () => {
    expect(matchGlob("src/index.ts", "**/dist/**")).toBe(false);
  });

  it("filterPaths removes ignored", () => {
    const paths = ["src/index.ts", "dist/bundle.js", "yarn.lock"];
    const result = filterPaths(paths);
    expect(result).toEqual(["src/index.ts"]);
  });

  it("hasSkipLabel detects labels", () => {
    expect(hasSkipLabel(["dependencies"], ["dependencies"])).toBe(true);
    expect(hasSkipLabel(["feature"], ["dependencies"])).toBe(false);
    expect(hasSkipLabel([], ["dependencies"])).toBe(false);
  });
});

describe("chunk", () => {
  it("estimates tokens", () => {
    expect(estimateTokens("hello world")).toBe(3);
  });

  it("single chunk when under budget", async () => {
    const chunks = await chunkDiff(
      [{ diff: "x".repeat(100), path: "a.ts" }],
      4000,
      500
    );
    expect(chunks.length).toBe(1);
  });

  it("splits when over budget", async () => {
    const chunks = await chunkDiff(
      [
        { diff: "x".repeat(10_000), path: "a.ts" },
        { diff: "x".repeat(10_000), path: "b.ts" },
      ],
      4000,
      500
    );
    expect(chunks.length).toBeGreaterThan(1);
  });
});

describe("markers", () => {
  it("hash is stable", () => {
    expect(hashContent("abc")).toBe(hashContent("abc"));
    expect(hashContent("abc")).not.toBe(hashContent("abd"));
  });

  it("extracts block", () => {
    const body = `intro\n<!-- describe:start hash=${hashContent(
      "desc"
    )} -->\n\`\`\`json\n{"type": "feature"}\n\`\`\`\ndesc\n<!-- describe:end -->`;
    const block = extractMarkerBlock(body);
    expect(block).not.toBeNull();
    expect(block?.hash).toBe(hashContent("desc"));
  });

  it("detects edited content", () => {
    const body = `<!-- describe:start hash=${hashContent(
      "original"
    )} -->\noriginal\n<!-- describe:end -->`;
    expect(isEdited(body, hashContent("original"))).toBe(false);
    expect(isEdited(body, hashContent("different"))).toBe(true);
  });

  it("renders and re-extracts", () => {
    const block = renderMarkerBlock("hello", "type: feature");
    const extracted = extractMarkerBlock(block);
    expect(extracted).not.toBeNull();
    expect(extracted?.description).toContain("hello");
  });

  it("appends checkbox when missing", () => {
    const body = `<!-- describe:start hash=${hashContent(
      "x"
    )} -->\nx\n<!-- describe:end -->`;
    const updated = appendRegenerateCheckbox(body);
    expect(updated).toContain("Regenerate description");
    expect(updated.match(/Regenerate description/g)?.length).toBe(1);
  });

  it("does not duplicate checkbox", () => {
    const body = `<!-- describe:start hash=${hashContent(
      "x"
    )} -->\nx\n- [ ] Regenerate description\n<!-- describe:end -->`;
    const updated = appendRegenerateCheckbox(body);
    expect(updated.match(/Regenerate description/g)?.length).toBe(1);
  });
});

describe("record", () => {
  it("validates a good record", () => {
    const result = ChangeRecordSchema.safeParse({
      audience: "internal",
      breaking: false,
      evidence: ["a.ts"],
      links: ["#1"],
      schema: 1,
      scope: "core",
      summary_customer: "x",
      summary_internal: "x",
      type: "feature",
    });
    expect(result.success).toBe(true);
  });

  it("rejects bad type", () => {
    const result = ChangeRecordSchema.safeParse({
      audience: "internal",
      breaking: false,
      evidence: [],
      links: [],
      schema: 1,
      scope: "core",
      summary_customer: "x",
      summary_internal: "x",
      type: "bogus",
    });
    expect(result.success).toBe(false);
  });

  it("fills defaults for a partial stored record", () => {
    const record = ChangeRecordFieldsSchema.parse({ type: "fix" });
    expect(record.type).toBe("fix");
    expect(record.audience).toBe("internal");
    expect(record.scope).toBe("core");
  });
});

describe("chunk reduction", () => {
  it("keeps every file's content when a large diff is reduced", async () => {
    const provider: Provider = {
      dispose: async () => {
        // no model to release
      },
      generateObject: async () => ({}),
      generateText: async ({ prompt }) => `summary of ${prompt.length}`,
      name: "fake",
    };
    const files = Array.from({ length: 6 }, (_, i) => ({
      diff: "x".repeat(9000),
      path: `f${i}.ts`,
    }));
    const chunks = await chunkDiff(files, 4000, 0, provider);
    expect(chunks.length).toBe(1);
    const allFiles = chunks.flatMap((c) => c.files.join(", ").split(", "));
    for (const f of files) {
      expect(allFiles.some((p) => p.includes(f.path))).toBe(true);
    }
  });

  it("throws instead of dropping content when reduction cannot fit", async () => {
    const provider: Provider = {
      dispose: async () => {
        // no model to release
      },
      generateObject: async () => ({}),
      generateText: async () => "y".repeat(20_000),
      name: "fake",
    };
    const files = Array.from({ length: 4 }, (_, i) => ({
      diff: "x".repeat(9000),
      path: `f${i}.ts`,
    }));
    await expect(chunkDiff(files, 4000, 0, provider)).rejects.toThrow(
      /could not be reduced/
    );
  });
});

describe("provider", () => {
  it("resolves the default and supported models", () => {
    expect(DEFAULT_MODEL).toBe("qwen2.5-1.5b");
    expect(resolveModel(undefined)).toBe("qwen2.5-1.5b");
    expect(resolveModel("qwen2.5-1.5b")).toBe("qwen2.5-1.5b");
  });

  it("rejects unknown models with the supported list", () => {
    expect(() => resolveModel("gpt-4o")).toThrow(/Supported: qwen2.5-0.5b/);
  });

  it("rejects removed remote providers", () => {
    expect(() => getProvider("anthropic")).toThrow(/Unknown provider/);
    expect(() => getProvider("openai")).toThrow(/Unknown provider/);
  });

  it("uses a context window large enough for a 4000-token chunk", () => {
    expect(CONTEXT_SIZE).toBeGreaterThanOrEqual(8192);
  });

  it("mock provider returns a record the generator accepts", async () => {
    const provider = getProvider("mock");
    const raw = await provider.generateObject({
      prompt: "",
      schema: {},
      schemaName: "change_record",
      system: "",
    });
    expect(ModelOutputSchema.safeParse(raw).success).toBe(true);
    await provider.dispose();
  });
});

describe("generateDescription", () => {
  const config: ResolvedConfig = { ...DEFAULT_CONFIG, scopes: {} };
  const diff = "diff --git a/src/x.ts b/src/x.ts\n+x\n";
  const data = {
    body: "",
    commits: ["fix: x"],
    config,
    files: [{ diff, path: "src/x.ts" }],
    issueNumbers: [],
    promptDiff: diff,
    prTemplate: null,
    title: "t",
  };
  const valid = {
    audience: "customer",
    breaking: false,
    evidence: ["src/x.ts"],
    links: [],
    risks: [],
    scope: "core",
    summary: "Adds x.",
    summary_customer: "Adds x",
    summary_internal: "Adds x",
    testing: [],
    type: "feature",
  };
  // Answers each call as the model would: the record for the record schema,
  // and a type and scope for the second opinion.
  const provider = (out: () => unknown): Provider => ({
    dispose: async () => {
      // no model to release
    },
    generateObject: async (input) =>
      input.schemaName === "type_and_scope"
        ? { scope: "core", type: "feature" }
        : out(),
    generateText: async () => "",
    name: "fake",
  });

  it("writes the changes list from code and renders the headings", async () => {
    const result = await generateDescription(
      provider(() => valid),
      data
    );
    expect(result.description).toBe(
      "## Summary\n\nAdds x.\n\n## Changes\n\n- `src/x.ts` (+1 −0)\n\n## Testing\n\n- Not stated\n\n## Risks\n\n- Not stated"
    );
  });

  it("drops summary sentences that name a file not in the diff", async () => {
    const out = { ...valid, summary: "Adds x. Also rewrites src/ghost.ts." };
    const result = await generateDescription(
      provider(() => out),
      data
    );
    expect(result.description).toContain("## Summary\n\nAdds x.");
    expect(result.description).not.toContain("ghost");
  });

  it("keeps only evidence and links that exist in the input", async () => {
    const out = {
      ...valid,
      evidence: ["none", "src/x.ts", "src/ghost.ts"],
      links: ["https://example.invalid/pull/1"],
    };
    const result = await generateDescription(
      provider(() => out),
      data
    );
    expect(result.record.evidence).toEqual(["src/x.ts"]);
    expect(result.record.links).toEqual([]);
  });

  it("does not report tests unless tests or the PR text show them", async () => {
    const out = { ...valid, testing: ["Adds unit tests for rounding."] };
    const result = await generateDescription(
      provider(() => out),
      data
    );
    expect(result.description).toContain("## Testing\n\n- Not stated");
  });

  it("reports tests when a test file changed", async () => {
    const testDiff = "diff --git a/src/x.test.ts b/src/x.test.ts\n+x\n";
    const out = { ...valid, testing: ["Covers the new behavior."] };
    const result = await generateDescription(
      provider(() => out),
      {
        ...data,
        files: [{ diff: testDiff, path: "src/x.test.ts" }],
        promptDiff: testDiff,
      }
    );
    expect(result.description).toContain("- Covers the new behavior.");
  });

  it("clears breaking unless the PR text says so", async () => {
    const out = { ...valid, breaking: true };
    const result = await generateDescription(
      provider(() => out),
      data
    );
    expect(result.record.breaking).toBe(false);
  });

  it("fails when the summary stays empty", async () => {
    let calls = 0;
    const p = provider(() => {
      calls++;
      return { ...valid, summary: "   " };
    });
    await expect(generateDescription(p, data)).rejects.toThrow(
      /summary must not be empty/
    );
    expect(calls).toBe(2);
  });
});

describe("grounding", () => {
  it("counts added and removed lines per file", () => {
    const files = fileChanges([
      { diff: "+++ b/a.ts\n-old\n+new\n+more\n", path: "a.ts" },
    ]);
    expect(files).toEqual([{ added: 2, path: "a.ts", removed: 1 }]);
  });

  it("keeps grounded sentences and drops the others", () => {
    const source = "src/a.ts renames parseId";
    expect(
      groundSentences("Renames parseId in src/a.ts. Moves src/b.ts.", source)
        .text
    ).toBe("Renames parseId in src/a.ts.");
  });

  it("detects test and risk signals from paths and PR text", () => {
    expect(hasTestSignal(["src/a.test.ts"], "")).toBe(true);
    expect(hasTestSignal(["src/a.ts"], "adds tests")).toBe(true);
    expect(hasTestSignal(["src/a.ts"], "")).toBe(false);
    expect(hasRiskSignal(["db/migrations/1.sql"], "")).toBe(true);
    expect(hasRiskSignal(["src/a.ts"], "BREAKING change")).toBe(true);
    expect(hasRiskSignal(["src/a.ts"], "")).toBe(false);
  });
});

describe("scope and paths", () => {
  it("reads changed paths from the diff headers", () => {
    const diff =
      "diff --git a/src/billing/x.ts b/src/billing/x.ts\n+a\ndiff --git a/README.md b/README.md\n+b";
    expect(changedPaths(diff)).toEqual(["src/billing/x.ts", "README.md"]);
  });

  it("picks the scope whose globs match the most files", () => {
    const scopes = { api: ["src/api/**"], billing: ["src/billing/**"] };
    expect(
      resolveScope(
        ["src/billing/a.ts", "src/billing/b.ts", "src/api/c.ts"],
        scopes,
        "api"
      )
    ).toBe("billing");
  });

  it("ignores a model scope that is a list, not a configured name", () => {
    const scopes = { api: [], billing: [] };
    expect(resolveScope([], scopes, "api, billing, ui")).toBe("core");
    expect(resolveScope([], scopes, "billing")).toBe("billing");
  });

  it("accepts a single-word model scope when no scopes are configured", () => {
    expect(resolveScope([], {}, "ci")).toBe("ci");
    expect(resolveScope([], {}, "a, b")).toBe("core");
  });
});

describe("type from paths", () => {
  it("classifies docs-only and CI/lockfile-only changes", () => {
    expect(typeFromPaths(["README.md", "docs/a.txt"])).toBe("docs");
    expect(typeFromPaths([".github/workflows/ci.yml", "bun.lock"])).toBe(
      "internal"
    );
  });

  it("classifies test-only changes as internal", () => {
    expect(typeFromPaths(["tests/billing/pricing.test.ts"])).toBe("internal");
    expect(typeFromPaths(["src/a.spec.ts", "src/b.test.ts"])).toBe("internal");
  });

  it("leaves mixed or product changes to the model", () => {
    expect(typeFromPaths(["README.md", "src/a.ts"])).toBeNull();
    expect(typeFromPaths(["src/billing/pricing.ts"])).toBeNull();
    expect(typeFromPaths([])).toBeNull();
  });
});

describe("chunk model-call cap", () => {
  it("fails before any model call when the diff needs too many chunks", async () => {
    let calls = 0;
    const provider: Provider = {
      dispose: async () => {
        // no model to release
      },
      generateObject: async () => ({}),
      generateText: async () => {
        calls++;
        return "x";
      },
      name: "fake",
    };
    const files = Array.from({ length: MAX_SUMMARY_CALLS + 5 }, (_, i) => ({
      diff: "x".repeat(9000),
      path: `f${i}.ts`,
    }));
    await expect(chunkDiff(files, 4000, 0, provider)).rejects.toThrow(
      /too large to summarize/
    );
    expect(calls).toBe(0);
  });
});

describe("config", () => {
  it("reads .describerc.json and fills in defaults", async () => {
    const dir = mkdtempSync(join(tmpdir(), "describe-cfg-"));
    writeFileSync(
      join(dir, CONFIG_FILE),
      JSON.stringify({ model: "qwen2.5-0.5b", scopes: { api: ["src/api/**"] } })
    );
    const config = await loadConfig(dir);
    expect(config.model).toBe("qwen2.5-0.5b");
    expect(config.scopes).toEqual({ api: ["src/api/**"] });
    expect(config.provider).toBe("ggml-node");
  });

  it("uses defaults when no config file exists", async () => {
    const dir = mkdtempSync(join(tmpdir(), "describe-cfg-"));
    const config = await loadConfig(dir);
    expect(config.provider).toBe("ggml-node");
    expect(config.model).toBeUndefined();
  });

  it("names the file in the error for invalid JSON", () => {
    expect(() => parseConfig("{ provider: ", "x/.describerc.json")).toThrow(
      /x\/\.describerc\.json is not valid JSON/
    );
  });

  it("rejects a JSON value that is not an object", () => {
    expect(() => parseConfig("[1, 2]", "cfg.json")).toThrow(
      /must contain a JSON object/
    );
  });
});

describe("record output", () => {
  it("renders the record as JSON without the schema field", () => {
    const json = JSON.parse(
      recordToJson(ChangeRecordSchema.parse({ type: "fix" }))
    );
    expect(json.type).toBe("fix");
    expect(json.schema).toBeUndefined();
  });
});

describe("changelog", () => {
  const entry = (n: number, type: string, breaking = false) => ({
    prNumber: n,
    record: ChangeRecordSchema.parse({
      audience: "developer",
      breaking,
      summary_customer: `c${n}`,
      summary_internal: `i${n}`,
      type,
    }),
    title: `t${n}`,
  });

  it("extracts PR numbers from merge and squash commit subjects", () => {
    expect(
      prNumbersFromMessages([
        "Merge pull request #12 from x/y",
        "fix: thing (#7)",
        "fix: thing (#7)",
        "docs: no PR here",
      ])
    ).toEqual([12, 7]);
  });

  it("writes a single changeset block with a minor bump for features", () => {
    const out = renderChangeset([entry(1, "fix"), entry(2, "feature")], {
      from: "a",
      packageName: "@frontal-labs/pr-describe",
      to: "b",
    });
    expect(out.startsWith('---\n"@frontal-labs/pr-describe": minor\n---')).toBe(
      true
    );
    expect(out.match(/^---$/gm)?.length).toBe(2);
  });

  it("needs a package name for the changeset format", () => {
    expect(() =>
      renderChangeset([entry(1, "fix")], { from: "a", to: "b" })
    ).toThrow(/package name/);
  });

  it("links PR numbers when a repository URL is given", () => {
    const out = renderMarkdown([entry(5, "fix")], {
      from: "a",
      repoUrl: "https://github.com/o/r",
      to: "b",
    });
    expect(out).toContain("([#5](https://github.com/o/r/pull/5))");
  });
});

describe("marker round trip", () => {
  it("reads back the record JSON written into the block", () => {
    const record: ChangeRecord = ChangeRecordSchema.parse({
      audience: "developer",
      summary_customer: "x",
      type: "fix",
    });
    const body = replaceOrInsertMarkerBlock(
      "intro",
      renderMarkerBlock("desc", recordToJson(record))
    );
    const block = extractMarkerBlock(body);
    expect(block).not.toBeNull();
    expect(JSON.parse(block?.recordJson ?? "{}").type).toBe("fix");
  });
});

describe("second opinion on uncertain fields", () => {
  const config: ResolvedConfig = { ...DEFAULT_CONFIG, scopes: {} };
  const diff = "diff --git a/src/x.ts b/src/x.ts\n+x\n";
  const data = {
    body: "",
    commits: ["fix: x"],
    config,
    files: [{ diff, path: "src/x.ts" }],
    issueNumbers: [],
    promptDiff: diff,
    prTemplate: null,
    title: "t",
  };
  const first = {
    audience: "customer",
    breaking: false,
    evidence: [],
    links: [],
    risks: [],
    scope: "core",
    summary: "Adds x.",
    summary_customer: "Adds x",
    summary_internal: "Adds x",
    testing: [],
    type: "feature",
  };

  it("flags type and scope when the second answer disagrees", async () => {
    let calls = 0;
    const provider: Provider = {
      dispose: async () => {
        // no model to release
      },
      generateObject: async (input) => {
        calls++;
        if (input.schemaName === "type_and_scope") {
          return { scope: "api", type: "fix" };
        }
        return first;
      },
      generateText: async () => "",
      name: "fake",
    };
    const result = await generateDescription(provider, data);
    expect(result.review).toEqual(["type", "scope"]);
    expect(result.description.startsWith("> **Needs review:**")).toBe(true);
  });

  it("does not ask again when code already decided type and scope", async () => {
    let calls = 0;
    const docsDiff = "diff --git a/README.md b/README.md\n+x\n";
    const provider: Provider = {
      dispose: async () => {
        // no model to release
      },
      generateObject: async (input) => {
        calls++;
        return input.schemaName === "type_and_scope"
          ? { scope: "docs", type: "docs" }
          : { ...first, scope: "docs" };
      },
      generateText: async () => "",
      name: "fake",
    };
    const config2: ResolvedConfig = {
      ...DEFAULT_CONFIG,
      scopes: { docs: ["*.md"] },
    };
    const result = await generateDescription(provider, {
      ...data,
      config: config2,
      files: [{ diff: docsDiff, path: "README.md" }],
      promptDiff: docsDiff,
    });
    expect(calls).toBe(1);
    expect(result.review).toEqual([]);
    expect(result.record.type).toBe("docs");
  });
});

describe("describe pipeline", () => {
  const diff = "diff --git a/src/x.ts b/src/x.ts\n+x\n";
  const config: ResolvedConfig = { ...DEFAULT_CONFIG, scopes: {} };
  const baseCollected = {
    author: "a",
    base: "main",
    body: "",
    branch: "feat",
    commits: ["fix: x"],
    diff,
    fork: false,
    head: "abc",
    issueNumbers: [],
    labels: [],
    owner: "o",
    prNumber: 7,
    prTemplate: null,
    repo: "r",
    title: "Fix x",
  };
  const mock = getProvider("mock");

  it("skips fork PRs without calling the model", async () => {
    const outcome = await runDescribe(
      { collect: {}, config },
      {
        collect: async () => ({ ...baseCollected, fork: true, headOwner: "x" }),
        provider: mock,
      }
    );
    expect(outcome.status).toBe("skipped");
  });

  it("skips PRs with a skip label", async () => {
    const outcome = await runDescribe(
      { collect: {}, config: { ...config, skip_labels: ["skip-describe"] } },
      {
        collect: async () => ({ ...baseCollected, labels: ["skip-describe"] }),
        provider: mock,
      }
    );
    expect(outcome.status).toBe("skipped");
  });

  it("keeps a human-edited block without calling the model", async () => {
    const throwing: Provider = {
      dispose: async () => {
        // no model to release
      },
      generateObject: async () => {
        throw new Error("model must not run for edited PRs");
      },
      generateText: async () => {
        throw new Error("model must not run for edited PRs");
      },
      name: "throwing",
    };
    const first = await runDescribe(
      { collect: {}, config },
      { collect: async () => baseCollected, provider: mock }
    );
    if (first.status !== "generated") {
      throw new Error("expected a generated outcome");
    }
    // Anchor on the summary heading: the same sentence also appears in the JSON block.
    const edited = first.body.replace(
      "## Summary\n\nMock change description.",
      "## Summary\n\nHand edited."
    );
    const outcome: DescribeOutcome = await runDescribe(
      { collect: {}, config },
      {
        collect: async () => ({ ...baseCollected, body: edited }),
        provider: throwing,
      }
    );
    expect(outcome.status).toBe("edited");
  });

  it("returns a generated body with the marker block", async () => {
    const outcome = await runDescribe(
      { collect: {}, config },
      { collect: async () => baseCollected, provider: mock }
    );
    expect(outcome.status).toBe("generated");
    if (outcome.status === "generated") {
      expect(outcome.body).toContain("<!-- describe:start");
      expect(outcome.record.type).toBe("feature");
    }
  });
});

describe("arguments", () => {
  it("reads the command and typed flags", () => {
    const cli = parseArgs(["describe", "--pr", "42", "--dry-run", "--update"]);
    expect(cli.command).toBe("describe");
    expect(value(cli, "pr")).toBe("42");
    expect(on(cli, "dry-run")).toBe(true);
    expect(on(cli, "write-file")).toBe(false);
  });

  it("defaults the command to describe", () => {
    expect(parseArgs(["--dry-run"]).command).toBe("describe");
  });
});

describe("testing section", () => {
  const config: ResolvedConfig = { ...DEFAULT_CONFIG, scopes: {} };
  const valid = {
    audience: "developer",
    breaking: false,
    evidence: [],
    links: [],
    risks: [],
    scope: "core",
    summary: "Adds x.",
    summary_customer: "Adds x",
    summary_internal: "Adds x",
    testing: [],
    type: "feature",
  };
  const provider: Provider = {
    dispose: async () => {
      // no model to release
    },
    generateObject: async (input) =>
      input.schemaName === "type_and_scope"
        ? { scope: "core", type: "feature" }
        : valid,
    generateText: async () => "",
    name: "fake",
  };

  it("lists changed test files when the model names no tests", async () => {
    const diff = "diff --git a/tests/x.test.ts b/tests/x.test.ts\n+x\n";
    const result = await generateDescription(provider, {
      body: "",
      commits: ["fix: x"],
      config,
      files: [{ diff, path: "tests/x.test.ts" }],
      issueNumbers: [],
      promptDiff: diff,
      prTemplate: null,
      title: "t",
    });
    expect(result.description).toContain(
      "## Testing\n\n- Test file changed: `tests/x.test.ts`"
    );
  });

  it("says Not stated when no test file changed and the model names no tests", async () => {
    const diff = "diff --git a/src/x.ts b/src/x.ts\n+x\n";
    const result = await generateDescription(provider, {
      body: "",
      commits: ["fix: x"],
      config,
      files: [{ diff, path: "src/x.ts" }],
      issueNumbers: [],
      promptDiff: diff,
      prTemplate: null,
      title: "t",
    });
    expect(result.description).toContain("## Testing\n\n- Not stated");
  });
});
