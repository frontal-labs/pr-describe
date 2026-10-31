export type ChangeType =
  | "feature"
  | "fix"
  | "perf"
  | "refactor"
  | "docs"
  | "breaking"
  | "internal";

export type Audience = "customer" | "developer" | "internal";

export interface ChangeRecord {
  audience: Audience;
  breaking: boolean;
  evidence: string[];
  links: string[];
  schema: 1;
  scope: string;
  summary_customer: string;
  summary_internal: string;
  type: ChangeType;
}

export const VALID_TYPES: ChangeType[] = [
  "feature",
  "fix",
  "perf",
  "refactor",
  "docs",
  "breaking",
  "internal",
];

export const VALID_AUDIENCES: Audience[] = [
  "customer",
  "developer",
  "internal",
];

export interface ValidationError {
  message: string;
  path: string;
}

export function validateRecord(record: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  if (record === null || typeof record !== "object") {
    return [{ message: "record must be an object", path: "" }];
  }
  const r = record as Record<string, unknown>;

  if (r.schema !== 1) {
    errors.push({ message: "schema must be 1", path: "schema" });
  }
  if (!VALID_TYPES.includes(r.type as ChangeType)) {
    errors.push({
      message: `type must be one of ${VALID_TYPES.join(", ")}`,
      path: "type",
    });
  }
  if (typeof r.scope !== "string" || r.scope.length === 0) {
    errors.push({ message: "scope must be a non-empty string", path: "scope" });
  }
  if (!VALID_AUDIENCES.includes(r.audience as Audience)) {
    errors.push({
      message: `audience must be one of ${VALID_AUDIENCES.join(", ")}`,
      path: "audience",
    });
  }
  if (typeof r.breaking !== "boolean") {
    errors.push({ message: "breaking must be a boolean", path: "breaking" });
  }
  if (typeof r.summary_internal !== "string") {
    errors.push({
      message: "summary_internal must be a string",
      path: "summary_internal",
    });
  }
  if (typeof r.summary_customer !== "string") {
    errors.push({
      message: "summary_customer must be a string",
      path: "summary_customer",
    });
  }
  if (
    !(
      Array.isArray(r.evidence) &&
      r.evidence.every((e: unknown) => typeof e === "string")
    )
  ) {
    errors.push({
      message: "evidence must be an array of strings",
      path: "evidence",
    });
  }
  if (
    !(
      Array.isArray(r.links) &&
      r.links.every((l: unknown) => typeof l === "string")
    )
  ) {
    errors.push({
      message: "links must be an array of strings",
      path: "links",
    });
  }
  return errors;
}

export interface CoerceInput {
  audience?: string;
  breaking?: boolean;
  evidence?: string[];
  links?: string[];
  scope?: string;
  summary_customer?: string;
  summary_internal?: string;
  type?: string;
}

export function coerceRecord(partial: CoerceInput): ChangeRecord {
  const type: ChangeType =
    VALID_TYPES.includes(partial.type as ChangeType) && partial.type
      ? (partial.type as ChangeType)
      : "internal";
  const audience: Audience =
    VALID_AUDIENCES.includes(partial.audience as Audience) && partial.audience
      ? (partial.audience as Audience)
      : "internal";
  return {
    audience,
    breaking: partial.breaking === true,
    evidence: Array.isArray(partial.evidence)
      ? partial.evidence.filter((e): e is string => typeof e === "string")
      : [],
    links: Array.isArray(partial.links)
      ? partial.links.filter((l): l is string => typeof l === "string")
      : [],
    schema: 1,
    scope:
      typeof partial.scope === "string" && partial.scope.length > 0
        ? partial.scope
        : "core",
    summary_customer:
      typeof partial.summary_customer === "string"
        ? partial.summary_customer
        : "",
    summary_internal:
      typeof partial.summary_internal === "string"
        ? partial.summary_internal
        : "",
    type,
  };
}

export function defaultAudienceForType(_type: ChangeType): Audience {
  // The change-record schema defaults to `internal` for chore, deps and CI
  // changes. Since the type enum does not carry those types, all records
  // default to `internal` here; consumers may override per-scope.
  return "internal";
}

/** The change record as pretty JSON, without the internal `schema` field. */
export function recordToJson(record: ChangeRecord): string {
  const { schema: _schema, ...fields } = record;
  return JSON.stringify(fields, null, 2);
}
