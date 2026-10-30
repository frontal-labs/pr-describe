import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Centralized environment validation. All `process.env` reads in the app
 * flow through this module. The dynamic API key env var name comes from
 * config (`api_key_env`), so it is read via `getApiKey` rather than validated
 * statically here.
 */
export const env = createEnv({
  server: {
    GITHUB_TOKEN: z.string().optional(),
    GITHUB_REPOSITORY: z.string().optional(),
    PR_NUMBER: z.string().optional(),
    MOCK_DATA: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_BASE_URL: z.string().optional(),
  },
  runtimeEnv: process.env,
  skipValidation:
    typeof process !== "undefined" &&
    (process.env.NODE_ENV === "test" || process.env.BUN_TEST === "1"),
});

/**
 * Read a dynamic env var by name (used for the config-driven `api_key_env`).
 */
export function getApiKey(name: string): string | undefined {
  if (typeof process === "undefined") {
    return undefined;
  }
  return process.env[name];
}

export function isMockData(): boolean {
  return env.MOCK_DATA === "true" || env.MOCK_DATA === "1";
}
