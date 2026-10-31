export type ProviderName = "ggml-node" | "mock";

export type Section =
  | "summary"
  | "changes"
  | "testing"
  | "risks"
  | "breaking"
  | "links";

export interface FrontalConfig {
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

/**
 * Resolved config. `model` is optional: when unset, the provider uses
 * `DEFAULT_MODEL` from `providers`.
 */
export type ResolvedConfig = Omit<Required<FrontalConfig>, "model"> &
  Pick<FrontalConfig, "model">;

export const DEFAULT_CONFIG: ResolvedConfig = {
  ignore: [],
  large_change_threshold: 500,
  max_diff_lines: 4000,
  provider: "ggml-node",
  scopes: {},
  sections: ["summary", "changes", "testing", "risks"],
  skip_labels: [],
  tone: "concise",
};

export function mergeConfig(
  base: FrontalConfig,
  overrides?: Partial<FrontalConfig>
): ResolvedConfig {
  return {
    ...base,
    ...(overrides ?? {}),
  } as ResolvedConfig;
}
