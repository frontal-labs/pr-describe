// End-to-end: runs the real CLI in a subprocess against a local fake GitHub
// API. The model is the mock provider, so no model, network or real PR is used.
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve, spawn } from "bun";
import { renderMarkerBlock } from "../src/markers";
import { coerceRecord, recordToJson } from "../src/record";

const REPO = "/repos/o/r";
const CLI = join(import.meta.dir, "..", "src", "cli.ts");

const DIFF = [
  "diff --git a/src/billing/pricing.ts b/src/billing/pricing.ts",
  "--- a/src/billing/pricing.ts",
  "+++ b/src/billing/pricing.ts",
  "@@ -1 +1 @@",
  "-const amount = cents / 100;",
  "+const amount = Math.round(cents / 100);",
  "",
].join("\n");

interface FakeState {
  patchedBodies: string[];
  prBody: string;
}

const state: FakeState = { patchedBodies: [], prBody: "" };
let server: ReturnType<typeof Bun.serve>;
let baseUrl: string;

// Closed over `state`, so each test sees a fresh PR body and a clean log.
function route(req: Request): Response | Promise<Response> {
  const url = new URL(req.url);
  const json = (body: unknown, status = 200) => Response.json(body, { status });

  if (url.pathname === `${REPO}/pulls/7`) {
    if (req.method === "PATCH") {
      return (async () => {
        const payload = (await req.json()) as { body: string };
        state.patchedBodies.push(payload.body);
        return json({ number: 7 });
      })();
    }
    if ((req.headers.get("accept") ?? "").includes("diff")) {
      return new Response(DIFF, { headers: { "content-type": "text/plain" } });
    }
    return json({
      base: { ref: "main" },
      body: state.prBody,
      head: { ref: "feat", repo: { owner: { login: "o" } }, sha: "abc" },
      labels: [],
      number: 7,
      title: "Round prices to whole cents",
      user: { login: "dev" },
    });
  }
  if (url.pathname === `${REPO}/pulls/7/commits`) {
    return json([{ commit: { message: "fix: round prices" } }]);
  }
  if (url.pathname === `${REPO}/contents/.github/PULL_REQUEST_TEMPLATE.md`) {
    return json({ message: "Not Found" }, 404);
  }
  if (url.pathname === `${REPO}/compare/v1...v2`) {
    return json({
      commits: [
        { commit: { message: "Merge pull request #5 from dev/exports" } },
      ],
    });
  }
  if (url.pathname === `${REPO}/pulls/5`) {
    const record = coerceRecord({
      audience: "developer",
      summary_customer: "Faster CSV exports",
      summary_internal: "Faster CSV exports",
      type: "feature",
    });
    return json({
      body: renderMarkerBlock(
        "## Summary\n\nFaster CSV exports.",
        recordToJson(record)
      ),
      number: 5,
      title: "Faster CSV exports",
    });
  }
  return json({ message: `No fake route for ${url.pathname}` }, 404);
}

beforeAll(() => {
  server = serve({ fetch: route, port: 0 });
  baseUrl = `http://localhost:${server.port}`;
});

afterAll(() => {
  server.stop(true);
});

beforeEach(() => {
  state.patchedBodies = [];
  state.prBody = "";
});

function runCli(
  args: string[]
): Promise<{ code: number; stderr: string; stdout: string }> {
  // A fresh directory has no .describerc.json, so the defaults apply.
  const cwd = mkdtempSync(join(tmpdir(), "describe-e2e-"));
  const proc = spawn([process.execPath, CLI, ...args], {
    cwd,
    env: {
      ...process.env,
      GITHUB_API_URL: baseUrl,
      GITHUB_REPOSITORY: "o/r",
      GITHUB_TOKEN: "test-token",
      MOCK_DATA: "true",
    },
    stderr: "pipe",
    stdout: "pipe",
  });
  return Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]).then(([stdout, stderr, code]) => ({ code, stderr, stdout }));
}

describe("describe, end to end", () => {
  it("writes the generated block to the PR with --update", async () => {
    const result = await runCli(["describe", "--pr", "7", "--update"]);
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Updated PR #7");
    expect(state.patchedBodies).toHaveLength(1);
    expect(state.patchedBodies[0]).toContain("<!-- describe:start");
    expect(state.patchedBodies[0]).toContain("## Changes");
    expect(state.patchedBodies[0]).toContain(
      "`src/billing/pricing.ts` (+1 −1)"
    );
  });

  it("does not touch the PR with --dry-run", async () => {
    const result = await runCli([
      "describe",
      "--pr",
      "7",
      "--update",
      "--dry-run",
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Dry run: PR not updated");
    expect(state.patchedBodies).toHaveLength(0);
  });

  it("keeps a human-edited block and does not overwrite it", async () => {
    // First run writes the block; that body becomes the PR body with a human edit.
    await runCli(["describe", "--pr", "7", "--update"]);
    const written = state.patchedBodies[0];
    state.patchedBodies = [];
    state.prBody = written.replace(
      "## Summary\n\nMock change description.",
      "## Summary\n\nHand written."
    );

    const result = await runCli(["describe", "--pr", "7", "--update"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("edited by human");
    expect(state.patchedBodies).toHaveLength(1);
    expect(state.patchedBodies[0]).toContain("Hand written.");
    expect(state.patchedBodies[0]).toContain("Regenerate description");
  });

  it("refuses --update without a PR number before doing any work", async () => {
    const result = await runCli(["describe", "--update"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("--update needs --pr");
  });
});

describe("changelog, end to end", () => {
  it("builds release notes from the PR records between two refs", async () => {
    const result = await runCli([
      "changelog",
      "--from",
      "v1",
      "--to",
      "v2",
      "--format",
      "markdown",
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("## [v1..v2]");
    expect(result.stdout).toContain(
      "- Faster CSV exports ([#5](https://github.com/o/r/pull/5))"
    );
    expect(result.stderr).toBe("");
  });

  it("renders the slack format for the same range", async () => {
    const result = await runCli([
      "changelog",
      "--from",
      "v1",
      "--to",
      "v2",
      "--format",
      "slack",
      "--audience",
      "customer",
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Faster CSV exports");
  });

  it("rejects an unknown format with a usage error", async () => {
    const result = await runCli([
      "changelog",
      "--from",
      "v1",
      "--to",
      "v2",
      "--format",
      "pdf",
    ]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Unknown format: pdf");
  });
});
