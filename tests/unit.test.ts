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

  it("single chunk when under budget", () => {
    const chunks = chunkDiff(
      [{ diff: "x".repeat(100), path: "a.ts" }],
      4000,
      500
    );
    expect(chunks.length).toBe(1);
  });

  it("splits when over budget", () => {
    const chunks = chunkDiff(
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
    const body = `intro\n<!-- frontal:start hash=${hashContent(
      "desc"
    )} -->\n\`\`\`yaml\ntype: feature\n\`\`\`\ndesc\n<!-- frontal:end -->`;
    const block = extractMarkerBlock(body);
    expect(block).not.toBeNull();
    expect(block?.hash).toBe(hashContent("desc"));
  });

  it("detects edited content", () => {
    const body = `<!-- frontal:start hash=${hashContent(
      "original"
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
      "x"
    )} -->\nx\n<!-- frontal:end -->`;
    const updated = appendRegenerateCheckbox(body);
    expect(updated).toContain("Regenerate description");
    expect(updated.match(/Regenerate description/g)?.length).toBe(1);
  });

  it("does not duplicate checkbox", () => {
    const body = `<!-- frontal:start hash=${hashContent(
      "x"
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
