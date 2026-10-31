# GITHUB_ACTION

The composite action is defined in `action.yml` at the repository root. Reference it as `uses: ./` from a workflow in the same repository, or as `owner/repo@ref` once the repository is published (the remote form is not tested yet). A complete workflow is in [examples/pr-describe.yml](../examples/pr-describe.yml).

## Workflow

```yaml
on:
  pull_request:
    types: [opened, synchronize]
  issue_comment:
    types: [created]

jobs:
  describe:
    if: github.event_name == 'pull_request' || contains(github.event.comment.body, '/describe')
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: read
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0
        with:
          bun-version: "1.3.14"
      - run: bun install --frozen-lockfile
      - run: bun run build
      - uses: actions/cache@v4
        with:
          path: .ggml-cache
          key: ggml-node-qwen2.5-1.5b-v1
      - uses: ./
        env:
          GGML_NODE_CACHE_DIR: ${{ github.workspace }}/.ggml-cache
        with:
          pr_number: ${{ github.event.pull_request.number || github.event.issue.number }}
          token: ${{ secrets.GITHUB_TOKEN }}
          update: "true"
```

`github.event.issue.number` is needed for `/describe` comments, because `pull_request` is empty on comment events.

## Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `pr_number` | `github.event.pull_request.number` | Pull request to describe. Required. |
| `token` | `secrets.GITHUB_TOKEN` | GitHub token. |
| `model` | `""` | Model id. Empty uses the config file, then `qwen2.5-1.5b`. |
| `update` | `"false"` | `"true"` replaces the PR body. Needs `pull-requests: write`. Off by default. |
| `write_file` | `"false"` | `"true"` writes `.changes/<pr>.json` in the workspace. |
| `dry_run` | `"false"` | `"true"` runs without changing the PR. |

## What the action does

1. **Setup Bun** (pinned to a commit SHA and to Bun 1.3.14).
2. **Prepare.** If `node_modules/ggml-node` is missing, installs the action's dependencies with `--frozen-lockfile --production --ignore-scripts`. If `dist/cli.js` is missing, builds it.
3. **Describe.** Runs `node dist/cli.js describe --pr <n>`, adding `--dry-run`, `--write-file` and `--update` when the inputs are `"true"`.

The description and the change record go to the job log. Nothing is written into the repository, except `.changes/<pr>.json` when `write_file` is `"true"`.

## Notes

- Cache `.ggml-cache` so later runs skip the ~1.1 GB model download.
- Use `fetch-depth: 0` so the git history is present.
- Forks are skipped. Reading the base repository's secrets from a fork would need `pull_request_target`, which this tool does not use.
- No external API key is needed. The model runs inside the job.
