import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Centralized environment validation. All `process.env` reads in the app
 * flow through this module. Inference runs in-process via ggml-node, so no
 * model API keys are read here.
 */
export const env = createEnv({
  runtimeEnv: process.env,
  server: {
    GITHUB_REPOSITORY: z.string().optional(),
    GITHUB_TOKEN: z.string().optional(),
    MODEL: z.string().optional(),
    MOCK_DATA: z.string().optional(),
    PR_NUMBER: z.string().optional(),
  },
  skipValidation:
    typeof process !== "undefined" &&
    (process.env.NODE_ENV === "test" || process.env.BUN_TEST === "1"),
});

export function isMockData(): boolean {
  return env.MOCK_DATA === "true" || env.MOCK_DATA === "1";
}
