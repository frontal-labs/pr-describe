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
  schema: 1;
  type: ChangeType;
  scope: string;
  audience: Audience;
  breaking: boolean;
  summary_internal: string;
  summary_customer: string;
  evidence: string[];
  links: string[];
}

const VALID_TYPES: ChangeType[] = [
  "feature",
  "fix",
  "perf",
  "refactor",
  "docs",
  "breaking",
  "internal",
];

const VALID_AUDIENCES: Audience[] = ["customer", "developer", "internal"];

export interface ValidationError {
  path: string;
  message: string;
}

export function validateRecord(record: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  if (record === null || typeof record !== "object") {
    return [{ path: "", message: "record must be an object" }];
  }
  const r = record as Record<string, unknown>;

  if (r.schema !== 1) {
    errors.push({ path: "schema", message: "schema must be 1" });
  }
  if (!VALID_TYPES.includes(r.type as ChangeType)) {
    errors.push({
      path: "type",
      message: `type must be one of ${VALID_TYPES.join(", ")}`,
    });
  }
  if (typeof r.scope !== "string" || r.scope.length === 0) {
    errors.push({ path: "scope", message: "scope must be a non-empty string" });
  }
  if (!VALID_AUDIENCES.includes(r.audience as Audience)) {
    errors.push({
      path: "audience",
      message: `audience must be one of ${VALID_AUDIENCES.join(", ")}`,
    });
  }
  if (typeof r.breaking !== "boolean") {
    errors.push({ path: "breaking", message: "breaking must be a boolean" });
  }
  if (typeof r.summary_internal !== "string") {
    errors.push({
      path: "summary_internal",
      message: "summary_internal must be a string",
    });
  }
  if (typeof r.summary_customer !== "string") {
    errors.push({
      path: "summary_customer",
      message: "summary_customer must be a string",
    });
  }
  if (
    !(
      Array.isArray(r.evidence) &&
      r.evidence.every((e: unknown) => typeof e === "string")
    )
  ) {
    errors.push({
      path: "evidence",
      message: "evidence must be an array of strings",
    });
  }
  if (
    !(
      Array.isArray(r.links) &&
      r.links.every((l: unknown) => typeof l === "string")
    )
  ) {
    errors.push({
      path: "links",
      message: "links must be an array of strings",
    });
  }
  return errors;
}

export interface CoerceInput {
  type?: string;
  scope?: string;
  audience?: string;
  breaking?: boolean;
  summary_internal?: string;
  summary_customer?: string;
  evidence?: string[];
  links?: string[];
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
    schema: 1,
    type,
    scope:
      typeof partial.scope === "string" && partial.scope.length > 0
        ? partial.scope
        : "core",
    audience,
    breaking: partial.breaking === true,
    summary_internal:
      typeof partial.summary_internal === "string"
        ? partial.summary_internal
        : "",
    summary_customer:
      typeof partial.summary_customer === "string"
        ? partial.summary_customer
        : "",
    evidence: Array.isArray(partial.evidence)
      ? partial.evidence.filter((e): e is string => typeof e === "string")
      : [],
    links: Array.isArray(partial.links)
      ? partial.links.filter((l): l is string => typeof l === "string")
      : [],
  };
}

export function defaultAudienceForType(_type: ChangeType): Audience {
  // The change-record schema defaults to `internal` for chore, deps and CI
  // changes. Since the type enum does not carry those types, all records
  // default to `internal` here; consumers may override per-scope.
  return "internal";
}
