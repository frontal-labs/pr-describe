# CONFIGURATION

Configuration lives in `.describerc.json` at the repository root. `init` writes a template; missing or invalid files fall back to built-in defaults.

## Example `.describerc.json`

```json
{
  "ignore": ["**/*.snap", "dist/**"],
  "model": "qwen2.5-1.5b",
  "provider": "ggml-node",
  "scopes": {
    "billing": ["src/billing/**"],
    "ui": ["src/components/**"]
  },
  "sections": ["summary", "changes", "testing", "risks"],
  "skip_labels": ["dependencies", "skip-describe"],
  "tone": "concise",
  "large_change_threshold": 500,
  "max_diff_lines": 4000
}
```

## Options

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `ignore` | `string[]` | `[]` | Additional globs excluded from the diff, on top of the built-in ignore list (lockfiles, `dist/`, `vendor/`, `*.snap`, `*.min.*`, `generated/` etc.). |
| `model` | `string` | unset | ggml-node model id. When unset the provider default (`qwen2.5-1.5b`) is used. See [MODELS_AND_ACCURACY.md](MODELS_AND_ACCURACY.md). |
| `provider` | `"ggml-node" \| "mock"` | `"ggml-node"` | Inference provider. `mock` returns a fixed record without downloading a model. |
| `scopes` | `Record<string, string[]>` | `{}` | Scope name → glob list. Used to resolve the change record `scope` from changed paths. |
| `sections` | `string[]` | `["summary","changes","testing","risks"]` | Markdown sections rendered in the description body, in order. Unknown headings are skipped. |
| `skip_labels` | `string[]` | `[]` | PR labels that cause `describe` to skip the PR (case-insensitive). |
| `tone` | `string` | `"concise"` | Stored in config; not currently interpreted by the generator. |
| `large_change_threshold` | `number` | `500` | Total diff lines above which a change is treated as "large" (description not truncated to 250 words; chunk reduction enabled). |
| `max_diff_lines` | `number` | `4000` | Per-file line budget used when packing chunks. |

## Loading

`loadConfig()` reads `.describerc.json` from `process.cwd()` (or a passed directory). It deep-merges the file over `DEFAULT_CONFIG`. Unknown keys pass through untyped. Invalid JSON throws an error naming the file.

## Defaults

```ts
{
  ignore: [],
  large_change_threshold: 500,
  max_diff_lines: 4000,
  provider: "ggml-node",
  scopes: {},
  sections: ["summary", "changes", "testing", "risks"],
  skip_labels: [],
  tone: "concise"
}
```

`model` is intentionally absent from defaults; the provider resolves it to `qwen2.5-1.5b`.
