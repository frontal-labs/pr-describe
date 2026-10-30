export type ProviderName = "anthropic" | "openai" | "openai-compatible";

export type Section =
  | "summary"
  | "changes"
  | "testing"
  | "risks"
  | "breaking"
  | "links";

export interface FrontalConfig {
  provider?: ProviderName;
  model?: string;
  api_key_env?: string;
  sections?: Section[];
  tone?: string;
  scopes?: Record<string, string[]>;
  ignore?: string[];
  skip_labels?: string[];
  max_diff_lines?: number;
  large_change_threshold?: number;
}

export const DEFAULT_CONFIG: Required<FrontalConfig> = {
  provider: "anthropic",
  model: "claude-sonnet-5-5",
  api_key_env: "PR_DESCRIBE_API_KEY",
  sections: ["summary", "changes", "testing", "risks"],
  tone: "concise",
  scopes: {},
  ignore: [],
  skip_labels: [],
  max_diff_lines: 4000,
  large_change_threshold: 500,
};

export function mergeConfig(
  base: FrontalConfig,
  overrides?: Partial<FrontalConfig>
): Required<FrontalConfig> {
  return {
    ...base,
    ...(overrides ?? {}),
  } as Required<FrontalConfig>;
}
