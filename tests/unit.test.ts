import { describe, expect, it } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderChangeset, renderMarkdown } from "../src/changelog";
import {
  chunkDiff,
  estimateTokens,
  MAX_SUMMARY_CALLS,
} from "../src/core/chunk";
import { prNumbersFromMessages } from "../src/core/collect";
import {
  CONFIG_FILE,
  loadConfig,
  parseConfig,
} from "../src/core/config-loader";
import { filterPaths, hasSkipLabel, matchGlob } from "../src/core/filter";
import {
  changedPaths,
  filterClaimsByEvidence,
  generateDescription,
  resolveScope,
  typeFromPaths,
} from "../src/core/generate";
import {
  appendRegenerateCheckbox,
  extractMarkerBlock,
  hashContent,
  isEdited,
  renderMarkerBlock,
  replaceOrInsertMarkerBlock,
} from "../src/core/markers";
import { coerceRecord, recordToJson, validateRecord } from "../src/core/record";
import {
  CONTEXT_SIZE,
  DEFAULT_MODEL,
  getProvider,
  type Provider,
  resolveModel,
} from "../src/providers";

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
    const errors = validateRecord({
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
    expect(errors).toEqual([]);
  });

  it("rejects bad type", () => {
    const errors = validateRecord({
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
    expect(errors.length).toBeGreaterThan(0);
  });

  it("coerces partial", () => {
    const record = coerceRecord({ type: "fix" });
    expect(record.type).toBe("fix");
    expect(record.audience).toBe("internal");
    expect(record.scope).toBe("core");
  });
});

describe("filterClaimsByEvidence", () => {
  it("drops unsupported bullets", () => {
    const record = coerceRecord({
      evidence: ["src/api.ts"],
      type: "fix",
    });
    const description =
      "## Summary\n\n- Fixed the API\n- Random claim\n\n## Changes\n\n- Updated src/api.ts";
    const result = filterClaimsByEvidence(record, description);
    expect(result.description).toContain("Updated src/api.ts");
    expect(result.description).not.toContain("Random claim");
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
    expect(validateRecord(coerceRecord(raw as Record<string, never>))).toEqual(
      []
    );
    await provider.dispose();
  });
});

describe("generateDescription", () => {
  const config = {
    ignore: [],
    large_change_threshold: 500,
    max_diff_lines: 4000,
    provider: "mock",
    scopes: {},
    sections: ["summary", "changes", "testing", "risks"],
    skip_labels: [],
    tone: "concise",
  } as never;
  const data = {
    body: "",
    commits: ["fix: x"],
    config,
    diff: "+x",
    issueNumbers: [],
    prTemplate: null,
    title: "t",
  };
  const valid = {
    audience: "customer",
    breaking: false,
    changes: ["Adds x in src/x.ts"],
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

  it("renders headings from the config sections", async () => {
    const provider: Provider = {
      dispose: async () => {
        // no model to release
      },
      generateObject: async () => valid,
      generateText: async () => "",
      name: "fake",
    };
    const result = await generateDescription(provider, data);
    expect(result.record.type).toBe("feature");
    expect(result.description).toBe(
      "## Summary\n\nAdds x.\n\n## Changes\n\n- Adds x in src/x.ts\n\n## Testing\n\n- None\n\n## Risks\n\n- None"
    );
  });

  it("drops links that are not in the input and placeholder evidence", async () => {
    const provider: Provider = {
      dispose: async () => {
        // no model to release
      },
      generateObject: async () => ({
        ...valid,
        evidence: ["none", "src/x.ts"],
        links: ["https://example.invalid/pull/1"],
      }),
      generateText: async () => "",
      name: "fake",
    };
    const result = await generateDescription(provider, data);
    expect(result.record.links).toEqual([]);
    expect(result.record.evidence).toEqual(["src/x.ts"]);
  });

  it("fails when the summary stays empty", async () => {
    let calls = 0;
    const provider: Provider = {
      dispose: async () => {
        // no model to release
      },
      generateObject: async () => {
        calls++;
        return { ...valid, summary: "   " };
      },
      generateText: async () => "",
      name: "fake",
    };
    await expect(generateDescription(provider, data)).rejects.toThrow(
      /empty summary/
    );
    expect(calls).toBe(2);
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
    const json = JSON.parse(recordToJson(coerceRecord({ type: "fix" })));
    expect(json.type).toBe("fix");
    expect(json.schema).toBeUndefined();
  });
});

describe("evidence filter", () => {
  const base = { evidence: [] as string[] } as never;
  const desc = [
    "## Summary",
    "",
    "Adds rounding.",
    "",
    "## Changes",
    "",
    "- Rounds prices in src/billing/pricing.ts",
    "- Rewrites the cache",
    "",
    "## Testing",
    "",
    "- Adds a test for rounding",
  ].join("\n");

  it("keeps every bullet when there is no evidence to check", () => {
    const out = filterClaimsByEvidence(base, desc).description;
    expect(out).toContain("- Rewrites the cache");
    expect(out).toContain("- Adds a test for rounding");
  });

  it("drops bullets that mention no evidence entry", () => {
    const record = { ...(base as object), evidence: ["pricing.ts"] } as never;
    const out = filterClaimsByEvidence(record, desc).description;
    expect(out).toContain("- Rounds prices in src/billing/pricing.ts");
    expect(out).not.toContain("- Rewrites the cache");
  });

  it("puts - None under a section whose bullets were all dropped", () => {
    const record = {
      ...(base as object),
      evidence: ["nothing-matches"],
    } as never;
    const out = filterClaimsByEvidence(record, desc).description;
    expect(out).toContain("## Testing\n\n- None");
  });

  it("never touches the summary paragraph", () => {
    const record = {
      ...(base as object),
      evidence: ["nothing-matches"],
    } as never;
    expect(filterClaimsByEvidence(record, desc).description).toContain(
      "Adds rounding."
    );
  });
});

describe("changelog", () => {
  const entry = (n: number, type: string, breaking = false) => ({
    prNumber: n,
    record: coerceRecord({
      audience: "developer",
      breaking,
      summary_customer: `c${n}`,
      summary_internal: `i${n}`,
      type,
    } as never),
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
    const record = coerceRecord({
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
