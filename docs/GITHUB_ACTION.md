# GITHUB_ACTION

The composite action lives in `action.yml` and is referenced as `./` from a workflow in the same repo. See [examples/pr-describe.yml](../../examples/pr-describe.yml) for a complete workflow.

## Workflow example

```yaml
name: PR Describe

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
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Bun
        uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0
        with:
          bun-version: "1.3.14"

      - name: Install
        run: bun install --frozen-lockfile

      - name: Build
        run: bun run build

      - name: Cache model
        uses: actions/cache@v4
        with:
          path: .ggml-cache
          key: ggml-node-qwen2.5-1.5b-v1

      - name: Describe
        uses: ./
        env:
          GGML_NODE_CACHE_DIR: ${{ github.workspace }}/.ggml-cache
        with:
          pr_number: ${{ github.event.pull_request.number || github.event.issue.number }}
          token: ${{ secrets.GITHUB_TOKEN }}
          model: qwen2.5-1.5b
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `pr_number` | yes | `${{ github.event.pull_request.number || github.event.issue.number }}` | Pull request number. |
| `token` | no | `${{ secrets.GITHUB_TOKEN }}` | GitHub token. |
| `model` | no | `""` | ggml-node model id. Empty falls back to config, then `qwen2.5-1.5b`. |
| `write_file` | no | `"false"` | Also write `.changes/<pr>.json`. |
| `dry_run` | no | `"false"` | Print without writing. |

## How the action works

The action runs from its own checkout. It installs dependencies (skipping scripts when `node_modules/ggml-node` is absent), builds `dist/` when missing, then invokes `node dist/cli.js describe --pr <n>` with optional `--dry-run`/`--write-file`. It writes `pr-body.md`, `record.json`, and `description.md` into `.changes/`.

The action does **not** update the PR; it prints the generated body to the log. Fork PRs are skipped by default because reading the base repo's secrets would require `pull_request_target`.

## Notes

- Cache `.ggml-cache` so subsequent runs skip the ~1.1 GB model download.
- Use `fetch-depth: 0` on checkout so the diff is available.
- The model (ggml-node) runs inside the action's Node process; no external API key is needed.
