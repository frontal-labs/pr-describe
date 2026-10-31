import {
  CHANGELOG_TYPE_ORDER,
  DEFAULT_CHANGESET_BUMP_MINOR,
  DEFAULT_CHANGESET_BUMP_PATCH,
} from "./constants";
import type {
  Audience,
  ChangelogEntry,
  ChangelogFormat,
  ChangelogOptions,
  ChangeRecord,
  ChangeType,
} from "./types";

/** Records that are published. Internal-audience records never reach a changelog. */
function published(records: ChangelogEntry[]): ChangelogEntry[] {
  return records.filter((r) => r.record.audience !== "internal");
}

/** Group records by type, in CHANGELOG_TYPE_ORDER. A breaking record goes under "breaking". */
export function groupRecords(
  records: ChangelogEntry[]
): Map<ChangeType, ChangelogEntry[]> {
  const groups = new Map<ChangeType, ChangelogEntry[]>();
  for (const t of CHANGELOG_TYPE_ORDER) {
    groups.set(t, []);
  }
  for (const r of records) {
    const group: ChangeType =
      r.record.breaking && r.record.type !== "breaking"
        ? "breaking"
        : r.record.type;
    groups.get(group)?.push(r);
  }
  return groups;
}

function summaryOf(
  record: ChangeRecord,
  audience: Audience | undefined
): string {
  return audience === "customer"
    ? record.summary_customer
    : record.summary_internal;
}

function label(type: ChangeType): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/** Non-empty groups, in order. */
function sectionsOf(
  records: ChangelogEntry[]
): [ChangeType, ChangelogEntry[]][] {
  const groups = groupRecords(published(records));
  return CHANGELOG_TYPE_ORDER.flatMap((t): [ChangeType, ChangelogEntry[]][] => {
    const list = groups.get(t) ?? [];
    return list.length > 0 ? [[t, list]] : [];
  });
}

export function renderMarkdown(
  records: ChangelogEntry[],
  options: ChangelogOptions
): string {
  const lines: string[] = [`## [${options.from}..${options.to}]`, ""];
  for (const [type, list] of sectionsOf(records)) {
    lines.push(`### ${label(type)}`);
    for (const r of list) {
      const pr = `#${r.prNumber}`;
      const link = options.repoUrl
        ? `[${pr}](${options.repoUrl}/pull/${r.prNumber})`
        : pr;
      lines.push(`- ${summaryOf(r.record, options.audience)} (${link})`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

export function renderGitHubRelease(
  records: ChangelogEntry[],
  options: ChangelogOptions
): string {
  const lines: string[] = [];
  for (const [type, list] of sectionsOf(records)) {
    lines.push(`### ${label(type)}`);
    for (const r of list) {
      lines.push(`- ${summaryOf(r.record, options.audience)} (#${r.prNumber})`);
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
  records: ChangelogEntry[],
  options: ChangelogOptions
): string {
  if (!options.packageName) {
    throw new Error("The changeset format needs a package name (--package)");
  }
  const publishedRecords = published(records);
  if (publishedRecords.length === 0) {
    return "";
  }
  const minor = publishedRecords.some(
    (r) =>
      r.record.breaking ||
      r.record.type === "breaking" ||
      r.record.type === "feature"
  );
  const bump = minor
    ? DEFAULT_CHANGESET_BUMP_MINOR
    : DEFAULT_CHANGESET_BUMP_PATCH;
  const lines = ["---", `"${options.packageName}": ${bump}`, "---", ""];
  for (const [, list] of sectionsOf(records)) {
    for (const r of list) {
      lines.push(`- ${summaryOf(r.record, options.audience)} (#${r.prNumber})`);
    }
  }
  return lines.join("\n").trim();
}

export function renderSlackPayload(
  records: ChangelogEntry[],
  options: ChangelogOptions
): string {
  const sections = sectionsOf(records).map(([type, list]) => {
    const body = list
      .map((r) => `• ${summaryOf(r.record, options.audience)} (#${r.prNumber})`)
      .join("\n");
    return `*${label(type)}*\n${body}`;
  });
  return JSON.stringify(
    { prelude: `🔍 Changelog ${options.from} → ${options.to}`, sections },
    null,
    2
  );
}

/** Render records in the requested format. Each format has its own renderer. */
export function renderChangelog(
  format: ChangelogFormat,
  records: ChangelogEntry[],
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
