import type { z } from "zod";

/** A problem with how the tool was called or configured. Shown as a message, not a stack trace. */
export class UsageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "UsageError";
  }
}

/** One line per problem: "path: message". Used in every user-facing error. */
export function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const where = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${where}${issue.message}`;
    })
    .join("; ");
}

/** Parse `value` with `schema`, or throw an error that names `label` and every problem. */
export function parseOrThrow<T extends z.ZodType>(
  schema: T,
  value: unknown,
  label: string
): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`${label}: ${formatIssues(result.error)}`);
  }
  return result.data;
}

/** The message of a caught value. Works for anything that was thrown. */
export function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** An error to rethrow or inspect: always an Error, never a bare value. */
export function asError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}
