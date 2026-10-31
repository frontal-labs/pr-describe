import type { JsonSchemaObject } from "ggml-node";
import type { Provider } from "../providers";
import type { ResolvedConfig } from "./config";
import {
	type ChangeRecord,
	type CoerceInput,
	coerceRecord,
	VALID_AUDIENCES,
	VALID_TYPES,
	validateRecord,
} from "./record";

export interface GenerateResult {
	description: string;
	record: ChangeRecord;
}

/**
 * The diff is cut to this many characters before prompting. It matches the
 * 4000-token chunk budget (about 4 characters per token) so the prompt stays
 * inside the provider's context window.
 */
const DIFF_CHAR_LIMIT = 16_000;

const SYSTEM_PROMPT = `You write PR descriptions from a diff. Output only the JSON object.

Rules:
- Describe only what the diff changes. Do not claim tests, issues, reviews or deployments unless the input shows them.
- "description" is markdown with these headings in this order: ## Summary, ## Changes, ## Testing, ## Risks.
- "## Changes" is a bullet list. Each bullet names a changed file or symbol from the diff.
- "evidence" lists the exact file paths and symbols your bullets refer to, copied from the diff.
- "scope" is the area the changed paths belong to, taken from the scope list when one is given.
- "type" is one of: feature, fix, perf, refactor, docs, breaking, internal.
- Be factual and concise. No speculation.`;

/** JSON Schema the model output is constrained to. */
export const RECORD_SCHEMA: JsonSchemaObject = {
	type: "object",
	additionalProperties: false,
	required: [
		"type",
		"audience",
		"scope",
		"breaking",
		"summary_customer",
		"summary_internal",
		"evidence",
		"links",
		"description",
	],
	properties: {
		type: { type: "string", enum: VALID_TYPES },
		audience: { type: "string", enum: VALID_AUDIENCES },
		scope: { type: "string" },
		breaking: { type: "boolean" },
		summary_customer: { type: "string" },
		summary_internal: { type: "string" },
		evidence: { type: "array", items: { type: "string" } },
		links: { type: "array", items: { type: "string" } },
		description: { type: "string" },
	},
};

export async function generateDescription(
	provider: Provider,
	data: {
		title: string;
		body: string;
		commits: string[];
		issueNumbers: string[];
		diff: string;
		prTemplate: string | null;
		config: ResolvedConfig;
	},
): Promise<GenerateResult> {
	const prompt = buildPrompt(data);

	// The schema constrains the output shape, so a retry only helps when the
	// content fails validation (for example an empty description).
	const maxAttempts = 2;
	let lastError: Error | null = null;
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const raw = await provider.generateObject({
			prompt,
			schema: RECORD_SCHEMA,
			schemaName: "change_record",
			system: SYSTEM_PROMPT,
		});
		try {
			return groundRecord(parseOutput(raw), prompt);
		} catch (err) {
			lastError = err as Error;
		}
	}
	throw new Error(
		`Generation failed after retries: ${lastError?.message ?? "unknown"}`,
	);
}

function buildPrompt(data: {
	title: string;
	body: string;
	commits: string[];
	issueNumbers: string[];
	diff: string;
	prTemplate: string | null;
	config: ResolvedConfig;
}): string {
	const diff = data.diff.slice(0, DIFF_CHAR_LIMIT);
	const scopes = Object.keys(data.config.scopes);
	return [
		`PR title: ${data.title}`,
		`PR body: ${data.body || "(none)"}`,
		`Commits: ${data.commits.join("; ") || "(none)"}`,
		`Linked issues: ${data.issueNumbers.join(", ") || "(none)"}`,
		`Scope list: ${scopes.length > 0 ? scopes.join(", ") : "(none, use a short area name)"}`,
		`Sections: ${data.config.sections.join(", ")}`,
		`Diff:\n${diff}`,
	].join("\n");
}

function parseOutput(raw: unknown): GenerateResult {
	if (raw === null || typeof raw !== "object") {
		throw new Error("Model output is not an object");
	}
	const { description, ...fields } = raw as CoerceInput & {
		description?: unknown;
	};
	if (typeof description !== "string" || description.trim() === "") {
		throw new Error("Model output has an empty description");
	}
	const record = coerceRecord(fields);
	const errors = validateRecord(record);
	if (errors.length > 0) {
		throw new Error(`Validation errors: ${JSON.stringify(errors)}`);
	}
	return { description: description.trim(), record };
}

/**
 * Remove values the model could not have taken from the input: links that do
 * not appear in the prompt, and placeholder evidence such as "none".
 */
export function groundRecord(
	result: GenerateResult,
	prompt: string,
): GenerateResult {
	const evidence = result.record.evidence
		.map((e) => e.trim())
		.filter((e) => e.length > 0 && !PLACEHOLDERS.has(e.toLowerCase()));
	const links = result.record.links.filter((l) => prompt.includes(l));
	return { ...result, record: { ...result.record, evidence, links } };
}

const PLACEHOLDERS = new Set(["none", "n/a", "na", "null", "-"]);

/**
 * Drop any markdown claim that isn't backed by an evidence entry.
 * A "claim" is a bullet line. Non-bullet lines are kept as-is.
 */
export function filterClaimsByEvidence(
	record: ChangeRecord,
	description: string,
): { record: ChangeRecord; description: string } {
	const lines = description.split("\n");
	const kept: string[] = [];
	for (const line of lines) {
		const bulletMatch = /^\s*[-*]\s+(.+)/.exec(line);
		if (!bulletMatch) {
			kept.push(line);
			continue;
		}
		const claim = bulletMatch[1].toLowerCase();
		const backed = record.evidence.some((e) => claim.includes(e.toLowerCase()));
		if (backed) {
			kept.push(line);
		}
	}
	return { description: kept.join("\n"), record };
}
