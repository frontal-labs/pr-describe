// Tests the zod schemas directly: what they accept, what they reject, and the
// defaults they fill. These are the rules the rest of the tool relies on.
import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { parseArgs } from "../src/args";
import { CHANGE_TYPES, DEFAULT_LARGE_CHANGE_THRESHOLD } from "../src/constants";
import { parseConfig } from "../src/loader";
import {
  ChangelogArgsSchema,
  ChangeRecordFieldsSchema,
  ChangeRecordSchema,
  CommitListSchema,
  CompareSchema,
  ConfigSchema,
  DescribeArgsSchema,
  grammarSchema,
  InitArgsSchema,
  ModelOutputSchema,
  PullRequestSchema,
  TypeScopeSchema,
} from "../src/types";
import { formatIssues } from "../src/validate";

/** The error text of a failed safeParse result. Empty when the parse succeeded. */
function issuesText(result: { success: boolean; error?: z.ZodError }): string {
  return result.success || !result.error ? "" : formatIssues(result.error);
}

const validOutput = {
  audience: "developer",
  breaking: false,
  evidence: ["src/a.ts"],
  links: [],
  risks: [],
  scope: "core",
  summary: "Adds a.",
  summary_customer: "Adds a.",
  summary_internal: "Adds a.",
  testing: [],
  type: "feature",
};

describe("config schema", () => {
  it("fills defaults for an empty object", () => {
    const config = ConfigSchema.parse({});
    expect(config.provider).toBe("ggml-node");
    expect(config.sections).toEqual(["summary", "changes", "testing", "risks"]);
    expect(config.large_change_threshold).toBe(DEFAULT_LARGE_CHANGE_THRESHOLD);
    expect(config.scopes).toEqual({});
  });

  it("rejects unknown keys so typos fail loudly", () => {
    const result = ConfigSchema.safeParse({ tone: "concise" });
    expect(result.success).toBe(false);
  });

  it("rejects unknown sections and models", () => {
    expect(ConfigSchema.safeParse({ sections: ["breaking"] }).success).toBe(
      false
    );
    expect(ConfigSchema.safeParse({ model: "gpt-4o" }).success).toBe(false);
    expect(ConfigSchema.safeParse({ provider: "anthropic" }).success).toBe(
      false
    );
  });

  it("rejects an empty section list and non-positive thresholds", () => {
    expect(ConfigSchema.safeParse({ sections: [] }).success).toBe(false);
    expect(ConfigSchema.safeParse({ large_change_threshold: 0 }).success).toBe(
      false
    );
    expect(
      ConfigSchema.safeParse({ large_change_threshold: 1.5 }).success
    ).toBe(false);
  });

  it("rejects absolute globs", () => {
    expect(ConfigSchema.safeParse({ ignore: ["/abs/**"] }).success).toBe(false);
  });

  it("names the file and the key in parse errors", () => {
    expect(() => parseConfig('{"tone":"x"}', "cfg.json")).toThrow(
      /cfg\.json is invalid: Unrecognized key: "tone"/
    );
  });
});

describe("model output schema", () => {
  it("accepts a complete answer", () => {
    expect(ModelOutputSchema.safeParse(validOutput).success).toBe(true);
  });

  it("rejects a missing field, an extra field and an empty summary", () => {
    const { risks: _r, ...missing } = validOutput;
    expect(ModelOutputSchema.safeParse(missing).success).toBe(false);
    expect(
      ModelOutputSchema.safeParse({ ...validOutput, changes: [] }).success
    ).toBe(false);
    expect(
      ModelOutputSchema.safeParse({ ...validOutput, summary: "  " }).success
    ).toBe(false);
  });

  it("rejects a type outside the change types", () => {
    expect(
      ModelOutputSchema.safeParse({ ...validOutput, type: "bogus" }).success
    ).toBe(false);
  });

  it("produces a grammar with the same fields and no $schema key", () => {
    const grammar = grammarSchema(ModelOutputSchema);
    expect(grammar).not.toHaveProperty("$schema");
    const shape = z
      .object({
        additionalProperties: z.literal(false),
        properties: z.record(z.string(), z.unknown()),
      })
      .parse(grammar);
    expect(Object.keys(shape.properties).sort()).toEqual(
      Object.keys(validOutput).sort()
    );
    const typeField = z
      .object({ enum: z.array(z.string()) })
      .parse(z.object({ type: z.unknown() }).parse(shape.properties).type);
    expect(typeField.enum).toEqual([...CHANGE_TYPES]);
  });

  it("validates the second opinion", () => {
    expect(
      TypeScopeSchema.safeParse({ scope: "api", type: "fix" }).success
    ).toBe(true);
    expect(TypeScopeSchema.safeParse({ scope: "api" }).success).toBe(false);
  });
});

describe("change record schemas", () => {
  it("fills defaults for stored records", () => {
    const record = ChangeRecordFieldsSchema.parse({ type: "fix" });
    expect(record).toEqual({
      audience: "internal",
      breaking: false,
      evidence: [],
      links: [],
      scope: "core",
      summary_customer: "",
      summary_internal: "",
      type: "fix",
    });
  });

  it("rejects blank scopes and evidence", () => {
    expect(
      ChangeRecordFieldsSchema.safeParse({ scope: " ", type: "fix" }).success
    ).toBe(false);
    expect(
      ChangeRecordFieldsSchema.safeParse({ evidence: [""], type: "fix" })
        .success
    ).toBe(false);
  });

  it("keeps the schema version on the full record only", () => {
    expect(ChangeRecordSchema.parse({ type: "fix" }).schema).toBe(1);
    expect(
      ChangeRecordFieldsSchema.safeParse({ schema: 1, type: "fix" }).success
    ).toBe(false);
  });
});

describe("GitHub response schemas", () => {
  it("accepts a pull request with a null body and a deleted fork", () => {
    const pr = {
      base: { ref: "main" },
      body: null,
      head: { ref: "feat", repo: null, sha: "abc" },
      labels: [{ name: "bug" }],
      number: 3,
      title: "t",
      user: null,
    };
    expect(PullRequestSchema.parse(pr).body).toBeNull();
  });

  it("rejects a response that is missing its head", () => {
    expect(
      PullRequestSchema.safeParse({
        base: { ref: "main" },
        body: "",
        labels: [],
        number: 1,
        title: "t",
        user: null,
      }).success
    ).toBe(false);
  });

  it("reads commit messages and compare results", () => {
    const commits = [{ commit: { message: "fix: x" } }];
    expect(CommitListSchema.parse(commits)).toEqual(commits);
    expect(CompareSchema.parse({ commits }).commits).toHaveLength(1);
    expect(CompareSchema.safeParse({}).success).toBe(false);
  });
});

describe("argument schemas", () => {
  it("requires --pr with --update", () => {
    const result = DescribeArgsSchema.safeParse({
      dryRun: false,
      update: true,
      writeFile: false,
    });
    expect(result.success).toBe(false);
    expect(issuesText(result)).toContain("--update needs --pr <number>");
  });

  it("rejects a non-integer PR number", () => {
    const result = DescribeArgsSchema.safeParse({
      dryRun: false,
      pr: 1.5,
      update: false,
      writeFile: false,
    });
    expect(result.success).toBe(false);
  });

  it("names the missing changelog flag", () => {
    const result = ChangelogArgsSchema.safeParse({
      format: "markdown",
      from: "v1",
    });
    expect(issuesText(result)).toContain("changelog needs --to <tag>");
  });

  it("explains an unknown changelog format", () => {
    const result = ChangelogArgsSchema.safeParse({
      format: "pdf",
      from: "v1",
      to: "v2",
    });
    expect(issuesText(result)).toContain("Unknown format: pdf");
  });

  it("parses flags from argv", () => {
    const cli = parseArgs(["describe", "--pr", "7", "--dry-run"]);
    expect(cli.command).toBe("describe");
    expect(cli.flags.get("pr")).toBe("7");
    expect(InitArgsSchema.parse({ force: false })).toEqual({ force: false });
  });
});
