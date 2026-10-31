# Examples

GitHub Actions workflow examples for `@frontal-labs/pr-describe`.

## Files

| File | Purpose |
|------|---------|
| [pr-describe.yml](pr-describe.yml) | Standard run on `pull_request` (opened/synchronize) and `issue_comment` (`/describe`). |
| [pr-describe-manual.yml](pr-describe-manual.yml) | Manual `workflow_dispatch` run for a specific PR number. |
| [pr-describe-dry-run.yml](pr-describe-dry-run.yml) | Dry-run only: prints the generated body without writing, useful for previews. |
| [pr-describe-write-file.yml](pr-describe-write-file.yml) | Writes `.changes/<pr>.json` in addition to printing the body. |

## Common setup

Every example uses:

- `actions/checkout@v4` with `fetch-depth: 0` (needed for the diff).
- `oven-sh/setup-bun` to install Bun.
- `bun install --frozen-lockfile` + `bun run build`.
- `actions/cache@v4` on `.ggml-cache` to skip the ~1.1 GB model download on repeat runs.
- The composite action `./` with `GGML_NODE_CACHE_DIR` set.

## Required permissions

```yaml
permissions:
  pull-requests: write
  contents: read
```

## Inputs

| Input | Description |
|-------|-------------|
| `pr_number` | Pull request number (defaults to the triggering event's PR/issue number). |
| `token` | GitHub token (defaults to `${{ secrets.GITHUB_TOKEN }}`). |
| `model` | ggml-node model id (defaults to config, then `qwen2.5-1.5b`). |
| `write_file` | `"true"` to also write `.changes/<pr>.json`. |
| `dry_run` | `"true"` to print without writing. |
| `update` | `"true"` to replace the PR body with the generated block. Off by default; needs `pull-requests: write`. |

## Notes

- Without `update: "true"` the action prints the generated body to the log and changes nothing on GitHub.
- Fork PRs are skipped by default.
- Cache `.ggml-cache` so subsequent runs skip the model download.
