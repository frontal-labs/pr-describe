# CLI_REFERENCE

Entry point: `dist/cli.js` (or `bun run` / `node dist/cli.js`).

Commands: `describe`, `changelog`, `init`.

## describe

Draft a PR description and change record from a diff.

```
node dist/cli.js describe --pr 42 [--dry-run] [--write-file] [--owner OWNER] [--repo REPO] [--token TOKEN] [--base BASE] [--head HEAD]
```

| Flag | Type | Description |
|------|------|-------------|
| `--pr` | number | Pull request number. Required for the GitHub path. |
| `--dry-run` | boolean | Print output without writing a new PR body or `.changes/` file. |
| `--write-file` | boolean | Also write `.changes/<pr>.json` containing the change record JSON. |
| `--owner` | string | GitHub owner. Defaults to `GITHUB_REPOSITORY`. |
| `--repo` | string | GitHub repo name. Defaults to `GITHUB_REPOSITORY`. |
| `--token` | string | GitHub token. Defaults to `GITHUB_TOKEN`. |
| `--base` | string | Base branch for local diff mode (default `main`). |
| `--head` | string | Head ref for local diff mode (default `HEAD`). |

Behavior:
1. Loads `.describerc.json`.
2. Collects PR data via Octokit (GitHub path) or `git diff`/`git log` (local path).
3. Skips fork PRs ("Fork PRs are not supported yet").
4. Skips PRs carrying any `skip_labels` label.
5. Parses file diffs, applies `ignore` globs, bails if nothing remains.
6. Picks the provider (`mock` when `MOCK_DATA=true`, else `config.provider`).
7. Chunks the diff (4000-token budget; reduces large diffs by summarizing chunks).
8. Generates the description + change record, filters unsupported claims by evidence.
9. Truncates the description to 250 words unless the change is large.
10. Renders a marker block, preserves human-edited blocks (appends a regenerate checkbox), otherwise replaces/inserts the block.
11. Unless `--dry-run`, prints the new PR body.

## changelog

```
node dist/cli.js changelog --from v1.0.0 --to v1.1.0
```

Stub. Prints `changelog --from <from> --to <to> (stub)`. The grouping/rendering logic lives in `src/changelog/index.ts` (renderers: `renderMarkdown`, `renderGitHubRelease`, `renderChangeset`, `renderSlackPayload`) but is not wired to a CLI command yet.

| Flag | Type | Description |
|------|------|-------------|
| `--from` | string | Start ref/tag. |
| `--to` | string | End ref/tag. |

## init

```
node dist/cli.js init [--force]
```

Writes `.describerc.json` with the default template. Errors if the file already exists unless `--force` is passed.

| Flag | Type | Description |
|------|------|-------------|
| `--force` | boolean | Overwrite an existing `.describerc.json`. |

## Exit codes

- `0` success.
- `1` unknown command, missing owner/repo, config already exists (without `--force`), or an unexpected error.
