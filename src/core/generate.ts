import type { Provider } from "../providers";
import type { FrontalConfig } from "./config";
import { type ChangeRecord, coerceRecord, validateRecord } from "./record";

export interface GenerateResult {
  record: ChangeRecord;
  description: string;
}

const SYSTEM_PROMPT = `You are a precise technical writer for a PR description system.
You must return two things separated by a delimiter line exactly:
---FRONTCAL_JSON---
<valid JSON matching the schema>
---FRONTCAL_MD---
<markdown description>

Rules:
- Every factual claim in the markdown must have a corresponding evidence entry.
- Use low temperature behaviour: be factual, concise, no speculation.
- The JSON must be valid and match the schema exactly.`;

export async function generateDescription(
  provider: Provider,
  data: {
    title: string;
    body: string;
    commits: string[];
    issueNumbers: string[];
    diff: string;
    prTemplate: string | null;
    config: Required<FrontalConfig>;
  }
): Promise<GenerateResult> {
  const sections = data.config.sections.join(", ");
  const prompt = buildPrompt(data, sections);

  const maxAttempts = 2;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const out = await provider.generate({ system: SYSTEM_PROMPT, prompt });
      return parseOutput(out.json, data.config);
    } catch (err) {
      lastError = err as Error;
    }
  }
  throw new Error(
    `Generation failed after retries: ${lastError?.message ?? "unknown"}`
  );
}

function buildPrompt(
  data: {
    title: string;
    body: string;
    commits: string[];
    issueNumbers: string[];
    diff: string;
    prTemplate: string | null;
    config: Required<FrontalConfig>;
  },
  sections: string
): string {
  const diff = data.diff.slice(0, 20000);
  return [
    `PR title: ${data.title}`,
    `PR body: ${data.body || "(none)"}`,
    `Commits: ${data.commits.join("; ") || "(none)"}`,
    `Linked issues: ${data.issueNumbers.join(", ") || "(none)"}`,
    `PR template: ${data.prTemplate ?? "(none)"}`,
    `Diff:\n${diff}`,
    "",
    `Produce a change record JSON and a markdown description with sections: ${sections}.`,
  ].join("\n");
}

function parseOutput(
  raw: string,
  _config: Required<FrontalConfig>
): GenerateResult {
  const jsonMatch = /---FRONTCAL_JSON---\n([\s\S]*?)\n---FRONTCAL_MD---/.exec(
    raw
  );
  if (!jsonMatch) {
    const altMatch = /```json\n([\s\S]*?)```/.exec(raw);
    if (!altMatch) {
      throw new Error("No JSON found in output");
    }
    const record = coerceRecord(JSON.parse(altMatch[1]));
    const errors = validateRecord(record);
    if (errors.length > 0) {
      throw new Error(`Validation errors: ${JSON.stringify(errors)}`);
    }
    const description = raw.replace(/```json[\s\S]*?```/, "").trim();
    return { record, description };
  }

  const record = coerceRecord(JSON.parse(jsonMatch[1]));
  const errors = validateRecord(record);
  if (errors.length > 0) {
    throw new Error(`Validation errors: ${JSON.stringify(errors)}`);
  }
  const description = raw.slice(jsonMatch.index + jsonMatch[0].length).trim();
  return { record, description };
}

export function filterClaimsByEvidence(
  record: ChangeRecord,
  description: string
): { record: ChangeRecord; description: string } {
  const evidenceSet = new Set(record.evidence);
  const lines = description.split("\n");
  const filtered = lines.filter((line) => {
    if (/^\s*[-*]\s+/.test(line)) {
      return true;
    }
    return true;
  });
  return { record, description: filtered.join("\n") };
}
