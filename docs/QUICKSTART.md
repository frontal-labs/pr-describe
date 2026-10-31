# QUICKSTART

Install, build, and generate your first PR description.

## 1. Clone and build

```sh
git clone <this repo> pr-describe && cd pr-describe
bun install && bun run build
```

`bun run build` compiles `src/cli.ts` to `dist/cli.js` and `src/action.ts` to `dist/action.js`. The first run downloads the default model (about 1.1 GB for `qwen2.5-1.5b`) and caches it on disk via ggml-node.

## 2. Initialize config

From inside a repository you want to describe:

```sh
cd /path/to/your/repo
node /path/to/pr-describe/dist/cli.js init
```

This writes `.describerc.json`. Edit it to set `model`, `provider`, `scopes`, `sections`, `ignore`, `skip_labels`, `tone`, `large_change_threshold`, and `max_diff_lines`. See [CONFIGURATION.md](CONFIGURATION.md).

## 3. Describe a PR

You need read access to the pull request. Set a token:

```sh
export GITHUB_TOKEN=...        # personal access token or GITHUB_TOKEN
export GITHUB_REPOSITORY=owner/repo
node /path/to/pr-describe/dist/cli.js describe --pr 42 --dry-run
```

Flags:

- `--pr 42` — pull request number (required with the GitHub path).
- `--dry-run` — print the description without writing a new PR body.
- `--write-file` — also write `.changes/42.json` with the change record.
- `--owner`, `--repo` — override owner/repo detected from `GITHUB_REPOSITORY`.
- `--token` — override `GITHUB_TOKEN`.

## Output

The command prints:

```
=== Generated PR description ===
## Summary
...

## Changes
- Updated src/api.ts

=== Change record ===
{
  "type": "fix",
  "audience": "internal",
  ...
}
```

Without `--dry-run` it also prints `--- New PR body (with markers) ---`, which is the full PR body with the generated block wrapped in `<!-- frontal:start ... -->` / `<!-- frontal:end -->` comments. See [OUTPUT_FORMAT.md](OUTPUT_FORMAT.md).

## Local (no GitHub) mode

Omit `--pr` and `GITHUB_REPOSITORY` to describe the working tree against `main`:

```sh
node /path/to/pr-describe/dist/cli.js describe --base main --head HEAD --dry-run
```

## Mock mode (no model download)

Set `MOCK_DATA=true` to use the built-in mock provider instead of ggml-node:

```sh
MOCK_DATA=true node /path/to/pr-describe/dist/cli.js describe --pr 42 --dry-run
```

Useful for CI smoke tests and offline development.
