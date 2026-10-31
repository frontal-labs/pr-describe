export type ProviderName = "anthropic" | "openai" | "openai-compatible";

export type Section =
  | "summary"
  | "changes"
  | "testing"
  | "risks"
  | "breaking"
  | "links";

export interface FrontalConfig {
  api_key_env?: string;
  ignore?: string[];
  large_change_threshold?: number;
  max_diff_lines?: number;
  model?: string;
  provider?: ProviderName;
  scopes?: Record<string, string[]>;
  sections?: Section[];
  skip_labels?: string[];
  tone?: string;
}

export const DEFAULT_CONFIG: Required<FrontalConfig> = {
  api_key_env: "PR_DESCRIBE_API_KEY",
  ignore: [],
  large_change_threshold: 500,
  max_diff_lines: 4000,
  model: "claude-sonnet-5-5",
  provider: "anthropic",
  scopes: {},
  sections: ["summary", "changes", "testing", "risks"],
  skip_labels: [],
  tone: "concise",
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
