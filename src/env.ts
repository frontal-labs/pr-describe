import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { FlagSchema } from "./types";

/**
 * Environment variables, validated once at startup. Everything else reads
 * `process.env` through here. Inference runs in-process, so no model API key
 * is read.
 */
export const env = createEnv({
  onValidationError: (issues) => {
    const lines = issues.map((issue) => {
      const key =
        issue.path?.map((p) => (typeof p === "object" ? p.key : p)).join(".") ??
        "";
      return `  ${key}: ${issue.message}`;
    });
    console.error(`Invalid environment variables:\n${lines.join("\n")}`);
    process.exit(1);
  },
  runtimeEnv: process.env,
  server: {
    GITHUB_API_URL: z.url({ error: "must be a URL" }).optional(),
    GITHUB_REPOSITORY: z
      .string()
      .regex(/^[^/\s]+\/[^/\s]+$/, {
        error: "must look like owner/repo",
      })
      .optional(),
    GITHUB_TOKEN: z.string().min(1).optional(),
    MOCK_DATA: z.string().optional(),
    MODEL: z.string().optional(),
  },
  skipValidation:
    typeof process !== "undefined" &&
    (process.env.NODE_ENV === "test" || process.env.BUN_TEST === "1"),
});

/** MOCK_DATA as a boolean: "true", "1", "yes" and "on" are on. */
export function isMockData(): boolean {
  return FlagSchema.safeParse(env.MOCK_DATA).data === true;
}
