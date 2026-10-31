import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { coerceRecord, validateRecord } from "../src/core/record";

interface Fixture {
  expected: {
    type: string;
    scope: string;
    breaking: boolean;
  };
  name: string;
}

const DIFF_SUFFIX = ".diff";
const JSON_SUFFIX = ".json";

function loadFixtures(): Fixture[] {
  const dir = join(import.meta.dir, "fixtures");
  const files = readdirSync(dir).filter((f) => f.endsWith(DIFF_SUFFIX));
  return files.map((f) => {
    const base = f.slice(0, -DIFF_SUFFIX.length);
    const metaPath = join(dir, `${base}${JSON_SUFFIX}`);
    const expected = existsSync(metaPath)
      ? JSON.parse(readFileSync(metaPath, "utf-8"))
      : { breaking: false, scope: "core", type: "internal" };
    return { expected, name: f };
  });
}

describe("fixtures", () => {
  const fixtures = loadFixtures();

  it("has at least 10 fixtures", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(10);
  });

  it.each(fixtures)("$name has valid expected values", (f) => {
    const record = coerceRecord({
      breaking: f.expected.breaking,
      scope: f.expected.scope,
      type: f.expected.type,
    });
    const errors = validateRecord(record);
    expect(errors).toEqual([]);
  });
});
