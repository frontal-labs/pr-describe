# CONFIGURATION

Configuration lives in `.describerc.json` at the repository root (the directory you run the command from). `init` writes a starter file. With no file, built-in defaults apply.

The file is validated with a strict zod schema (`ConfigSchema` in `src/types.ts`). A typo or an unsupported key is an error that names the key, so mistakes are never silently ignored.

## Example

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
  "large_change_threshold": 500
}
```

## Keys

| Key | Type | Default | Rules |
|-----|------|---------|-------|
| `provider` | `"ggml-node"` \| `"mock"` | `"ggml-node"` | `ggml-node` runs the model locally. `mock` returns fixed output (`MOCK_DATA=true` also selects it). |
| `model` | `"qwen2.5-0.5b"` \| `"qwen2.5-1.5b"` \| `"smollm2-360m"` | `qwen2.5-1.5b` | Any other id is an error. The `MODEL` env var overrides it. See [MODELS_AND_ACCURACY.md](MODELS_AND_ACCURACY.md). |
| `scopes` | object: name → glob list | `{}` | Names must not be blank. Globs must be relative (no leading `/`). The scope whose globs match the most changed files is used. Without a match, the model's scope is used only if it is one of these names (or any single word when `scopes` is empty). Otherwise `core`. |
| `ignore` | glob list | `[]` | Relative globs, removed from the diff. The built-in list always applies too. |
| `sections` | list of `"summary"`, `"changes"`, `"testing"`, `"risks"` | all four, in that order | At least one. Any other name is an error. |
| `skip_labels` | string list | `[]` | Labels are matched case-insensitively. PR mode only. |
| `large_change_threshold` | positive integer | `500` | Diff size in lines. Above it, the diff is summarized before generation (when it spans more than one chunk), and the description is not cut to 250 words. |

### Built-in ignore list

Always excluded, whatever `ignore` says: `bun.lock`, `bun.lockb`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `dist/`, `build/`, `vendor/`, `*.snap`, `*.min.js`, `*.min.css`, `*.generated.*`, `*.auto.*`, `generated/`, `auto-generated/`, `codegen/`, `__generated__/`.

## Errors

- **Unknown key**, for example `"tone"` or `"max_diff_lines"`: `.describerc.json is invalid: Unrecognized key: "tone"`. Remove the key. These keys were ignored in earlier versions and are not used now.
- **Bad value**, for example `"large_change_threshold": 0` or `"sections": []`: the error names the key and the problem.
- **Invalid JSON**, or a JSON value that is not an object: the error names the file.

## How the file is read

- The file is read from the current working directory. Run the command from the repository root.
- Missing file: defaults apply, with no error.
- Values in the file replace the defaults key by key. Objects such as `scopes` are replaced whole, not merged.
