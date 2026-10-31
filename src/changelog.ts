import type { Audience, ChangeRecord, ChangeType } from "./record";

export interface ChangelogOptions {
  audience?: Audience;
  format?: ChangelogFormat;
  from: string;
  /** Required for the changeset format: the package the changeset bumps. */
  packageName?: string;
  polish?: boolean;
  /** e.g. https://github.com/owner/repo, used to link PR numbers. */
  repoUrl?: string;
  to: string;
}

export interface RecordWithPR {
  prNumber: number;
  record: ChangeRecord;
  title: string;
}

const TYPE_ORDER: ChangeType[] = [
  "breaking",
  "feature",
  "fix",
  "perf",
  "refactor",
  "docs",
  "internal",
];

export function groupRecords(
  records: RecordWithPR[]
): Map<ChangeType, RecordWithPR[]> {
  const groups = new Map<ChangeType, RecordWithPR[]>();
  for (const t of TYPE_ORDER) {
    groups.set(t, []);
  }
  for (const r of records) {
    if (r.record.breaking && r.record.type !== "breaking") {
      const list = groups.get("breaking")!;
      list.push(r);
      continue;
    }
    const list = groups.get(r.record.type);
    if (list) {
      list.push(r);
    }
  }
  return groups;
}

export function renderMarkdown(
  records: RecordWithPR[],
  options: ChangelogOptions
): string {
  const filtered = records.filter((r) => r.record.audience !== "internal");
  const groups = groupRecords(filtered);
  const lines: string[] = [];
  const range = `## [${options.from}..${options.to}]`;
  lines.push(range);
  lines.push("");
  for (const t of TYPE_ORDER) {
    const list = groups.get(t);
    if (!list || list.length === 0) {
      continue;
    }
    const label = t.charAt(0).toUpperCase() + t.slice(1);
    lines.push(`### ${label}`);
    for (const r of list) {
      const summary =
        options.audience === "customer"
          ? r.record.summary_customer
          : r.record.summary_internal;
      const pr = `#${r.prNumber}`;
      const link = options.repoUrl
        ? `[${pr}](${options.repoUrl}/pull/${r.prNumber})`
        : pr;
      lines.push(`- ${summary} (${link})`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

export function renderGitHubRelease(
  records: RecordWithPR[],
  options: ChangelogOptions
): string {
  const filtered = records.filter((r) => r.record.audience !== "internal");
  const groups = groupRecords(filtered);
  const lines: string[] = [];
  for (const t of TYPE_ORDER) {
    const list = groups.get(t);
    if (!list || list.length === 0) {
      continue;
    }
    const label = t.charAt(0).toUpperCase() + t.slice(1);
    lines.push(`### ${label}`);
    for (const r of list) {
      const summary =
        options.audience === "customer"
          ? r.record.summary_customer
          : r.record.summary_internal;
      lines.push(`- ${summary} (#${r.prNumber})`);
    }
  }
  return lines.join("\n").trim();
}

/**
 * One changeset file: a single frontmatter block that bumps the package, then
 * one bullet per change. Breaking changes and features bump the minor version,
 * everything else bumps the patch version (this project is 0.x).
 */
export function renderChangeset(
  records: RecordWithPR[],
  options: ChangelogOptions
): string {
  if (!options.packageName) {
    throw new Error("The changeset format needs a package name (--package)");
  }
  const filtered = records.filter((r) => r.record.audience !== "internal");
  if (filtered.length === 0) {
    return "";
  }
  const minor = filtered.some(
    (r) =>
      r.record.breaking ||
      r.record.type === "breaking" ||
      r.record.type === "feature"
  );
  const lines = [
    "---",
    `"${options.packageName}": ${minor ? "minor" : "patch"}`,
    "---",
    "",
  ];
  const groups = groupRecords(filtered);
  for (const t of TYPE_ORDER) {
    for (const r of groups.get(t) ?? []) {
      const summary =
        options.audience === "customer"
          ? r.record.summary_customer
          : r.record.summary_internal;
      lines.push(`- ${summary} (#${r.prNumber})`);
    }
  }
  return lines.join("\n").trim();
}

export function renderSlackPayload(
  records: RecordWithPR[],
  options: ChangelogOptions
): string {
  const filtered = records.filter((r) => r.record.audience !== "internal");
  const groups = groupRecords(filtered);
  const prelude = `🔍 Changelog ${options.from} → ${options.to}`;
  const sections: string[] = [];
  for (const t of TYPE_ORDER) {
    const list = groups.get(t);
    if (!list || list.length === 0) {
      continue;
    }
    const label = t.charAt(0).toUpperCase() + t.slice(1);
    const body = list
      .map((r) => {
        const summary =
          options.audience === "customer"
            ? r.record.summary_customer
            : r.record.summary_internal;
        return `• ${summary} (#${r.prNumber})`;
      })
      .join("\n");
    sections.push(`*${label}*\n${body}`);
  }
  const payload = {
    prelude,
    sections,
  };
  return JSON.stringify(payload, null, 2);
}

export type ChangelogFormat =
  | "markdown"
  | "github-release"
  | "changeset"
  | "slack";

export const CHANGELOG_FORMATS: readonly ChangelogFormat[] = [
  "markdown",
  "github-release",
  "changeset",
  "slack",
];

/** Render records in the requested format. Each format has its own renderer. */
export function renderChangelog(
  format: ChangelogFormat,
  records: RecordWithPR[],
  options: ChangelogOptions
): string {
  switch (format) {
    case "markdown":
      return renderMarkdown(records, options);
    case "github-release":
      return renderGitHubRelease(records, options);
    case "changeset":
      return renderChangeset(records, options);
    case "slack":
      return renderSlackPayload(records, options);
    default:
      throw new Error(`Unknown changelog format: ${String(format)}`);
  }
}
