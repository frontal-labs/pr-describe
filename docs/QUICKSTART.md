# QUICKSTART

Install, build, configure, and generate your first PR description.

## 1. Clone and build

```sh
git clone <this repo> pr-describe && cd pr-describe
bun install && bun run build
```

`bun run build` compiles `src/cli.ts` to `dist/cli.js`. The first run that generates a description downloads the default model (about 1.1 GB for `qwen2.5-1.5b`) and caches it on disk via ggml-node.

## 2. Create the config

From the repository you want to describe:

```sh
cd /path/to/your/repo
node /path/to/pr-describe/dist/cli.js init
```

This writes `.describerc.json` with a starter template. Edit it to set `scopes`, `ignore`, `skip_labels` and `sections`. See [CONFIGURATION.md](CONFIGURATION.md).

## 3. Describe a PR

You need a token with read access to the pull request:

```sh
export GITHUB_TOKEN=...              # personal access token, or the token GitHub Actions provides
export GITHUB_REPOSITORY=owner/repo
node /path/to/pr-describe/dist/cli.js describe --pr 42 --dry-run
```

`--dry-run` prints the description and the change record, and does not print the new PR body. Drop it to also print the body with the marker block. To replace the PR body on GitHub, add `--update`. See [CLI_REFERENCE.md](CLI_REFERENCE.md).

## Output

```
=== Generated PR description ===
## Summary

Fixes rounding of prices to whole cents

## Changes

- `src/billing/pricing.ts` (+1 −1)

## Testing

- Not stated

## Risks

- Not stated

=== Change record ===
{
  "type": "fix",
  "audience": "developer",
  "scope": "billing",
  ...
}
```

Testing and Risks read "Not stated" unless the diff or the PR text shows them. A `> **Needs review:**` line appears when the model's second check disagreed on the type or scope. See [MODELS_AND_ACCURACY.md](MODELS_AND_ACCURACY.md).

## Local mode (no PR)

Pass a git range instead of `--pr`. `GITHUB_REPOSITORY` is not needed:

```sh
node /path/to/pr-describe/dist/cli.js describe --base main --head HEAD --dry-run
```

## Mock mode (no model)

`MOCK_DATA=true` swaps in a fixed mock model. Use it for smoke tests and offline work. The output is not a real description.

```sh
MOCK_DATA=true node /path/to/pr-describe/dist/cli.js describe --base main --head HEAD --dry-run
```
