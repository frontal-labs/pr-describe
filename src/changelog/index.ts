import type { Audience, ChangeRecord, ChangeType } from "../core/record";

export interface ChangelogOptions {
  from: string;
  to: string;
  audience?: Audience;
  format?: "markdown" | "github-release" | "changeset";
  polish?: boolean;
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
      lines.push(`- ${summary} ([#${r.prNumber}](${r.prNumber}))`);
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

export function renderChangeset(
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
    lines.push("---");
    lines.push(`"${label.toLowerCase()}": patch`);
    lines.push("---");
    for (const r of list) {
      const summary =
        options.audience === "customer"
          ? r.record.summary_customer
          : r.record.summary_internal;
      lines.push(summary);
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
