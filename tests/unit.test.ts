import { describe, expect, it } from "bun:test";
import { chunkDiff, estimateTokens } from "../src/core/chunk";
import { filterPaths, hasSkipLabel, matchGlob } from "../src/core/filter";
import {
	appendRegenerateCheckbox,
	extractMarkerBlock,
	hashContent,
	isEdited,
	renderMarkerBlock,
} from "../src/core/markers";
import { coerceRecord, validateRecord } from "../src/core/record";
import {
	filterClaimsByEvidence,
	generateDescription,
} from "../src/core/generate";
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
			500,
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
			500,
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
		const body = `intro\n<!-- frontal:start hash=${hashContent(
			"desc",
		)} -->\n\`\`\`yaml\ntype: feature\n\`\`\`\ndesc\n<!-- frontal:end -->`;
		const block = extractMarkerBlock(body);
		expect(block).not.toBeNull();
		expect(block?.hash).toBe(hashContent("desc"));
	});

	it("detects edited content", () => {
		const body = `<!-- frontal:start hash=${hashContent(
			"original",
		)} -->\noriginal\n<!-- frontal:end -->`;
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
		const body = `<!-- frontal:start hash=${hashContent(
			"x",
		)} -->\nx\n<!-- frontal:end -->`;
		const updated = appendRegenerateCheckbox(body);
		expect(updated).toContain("Regenerate description");
		expect(updated.match(/Regenerate description/g)?.length).toBe(1);
	});

	it("does not duplicate checkbox", () => {
		const body = `<!-- frontal:start hash=${hashContent(
			"x",
		)} -->\nx\n- [ ] Regenerate description\n<!-- frontal:end -->`;
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
			type: "fix",
			evidence: ["src/api.ts"],
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
			name: "fake",
			generateText: async ({ prompt }) => `summary of ${prompt.length}`,
			generateObject: async () => ({}),
			dispose: async () => {},
		};
		const files = Array.from({ length: 6 }, (_, i) => ({
			diff: "x".repeat(9_000),
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
			name: "fake",
			generateText: async () => "y".repeat(20_000),
			generateObject: async () => ({}),
			dispose: async () => {},
		};
		const files = Array.from({ length: 4 }, (_, i) => ({
			diff: "x".repeat(9_000),
			path: `f${i}.ts`,
		}));
		await expect(chunkDiff(files, 4000, 0, provider)).rejects.toThrow(
			/could not be reduced/,
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
			[],
		);
		await provider.dispose();
	});
});

describe("generateDescription", () => {
	const config = {
		api_key_env: undefined,
		ignore: [],
		large_change_threshold: 500,
		max_diff_lines: 4000,
		provider: "mock",
		scopes: {},
		sections: ["summary", "changes"],
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

	it("returns the record and description from structured output", async () => {
		const provider: Provider = {
			name: "fake",
			generateText: async () => "",
			generateObject: async () => ({
				audience: "customer",
				breaking: false,
				description: "## Summary\n\n- Adds x",
				evidence: ["x"],
				links: [],
				scope: "core",
				summary_customer: "Adds x",
				summary_internal: "Adds x",
				type: "feature",
			}),
			dispose: async () => {},
		};
		const result = await generateDescription(provider, data);
		expect(result.record.type).toBe("feature");
		expect(result.description).toContain("Adds x");
	});

	it("fails when the description stays empty", async () => {
		let calls = 0;
		const provider: Provider = {
			name: "fake",
			generateText: async () => "",
			generateObject: async () => {
				calls++;
				return { description: "   ", type: "fix" };
			},
			dispose: async () => {},
		};
		await expect(generateDescription(provider, data)).rejects.toThrow(
			/empty description/,
		);
		expect(calls).toBe(2);
	});
});
