# CLI_REFERENCE

Entry point: `dist/cli.js`, run with `node dist/cli.js <command> [flags]`. Commands: `describe`, `changelog`, `init`. Flags take a value (`--pr 42`) or stand alone (`--dry-run`).

## describe

Draft a PR description and change record.

```
node dist/cli.js describe --pr 42 [--dry-run] [--write-file] [--update] [--owner OWNER] [--repo REPO] [--token TOKEN]
node dist/cli.js describe --base main --head HEAD [--dry-run] [--write-file]
```

| Flag | Value | Description |
|------|-------|-------------|
| `--pr` | number | Pull request number. Selects PR mode. Needs `GITHUB_TOKEN` and `GITHUB_REPOSITORY` (or `--owner` and `--repo`). |
| `--base` | ref | Local mode: base ref. Default `main`. Used only when `--pr` is absent. |
| `--head` | ref | Local mode: head ref. Default `HEAD`. |
| `--owner`, `--repo` | string | Override the repository. Defaults to `GITHUB_REPOSITORY`. |
| `--token` | string | GitHub token. Defaults to `GITHUB_TOKEN`. |
| `--dry-run` | boolean | Print the description and record, but not the new PR body. With `--update`, the PR is not changed. |
| `--write-file` | boolean | Write the change record to `.changes/<pr>.json` (`local.json` in local mode). |
| `--update` | boolean | Replace the PR body with the generated body. Needs `--pr`. Off by default. |

Behavior, in order:

1. Loads `.describerc.json` (defaults apply when it is missing).
2. Reads the PR (title, body, commits, labels, template, diff) through the GitHub API, or reads the git range locally.
3. Skips fork PRs and PRs with a `skip_labels` label.
4. Drops files matching `ignore` (plus the built-in list, see [CONFIGURATION.md](CONFIGURATION.md)). Stops if nothing remains.
5. If the existing marker block was edited by a person, keeps it, adds a regenerate checkbox, and stops. The model does not run.
6. Otherwise generates the description and record. Large diffs are summarized in chunks first.
7. Prints the description, the change record, any `Needs review` fields, and how many sentences were dropped as ungrounded.
8. Writes `.changes/<pr>.json` if `--write-file` is set.
9. With `--update`, writes the body to the PR. Otherwise, unless `--dry-run`, prints the body.

Outputs go to stdout. Problems go to stderr.

## changelog

Build release notes from the change records in the PRs merged between two refs.

```
node dist/cli.js changelog --from v1.0.0 --to v1.1.0 [--format markdown] [--audience customer] [--package NAME]
```

| Flag | Value | Description |
|------|-------|-------------|
| `--from` | ref | Start ref (required). |
| `--to` | ref | End ref (required). |
| `--format` | `markdown` \| `github-release` \| `changeset` \| `slack` | Output format. Default `markdown`. |
| `--audience` | `customer` \| `developer` \| `internal` | Which summary to use. Records with audience `internal` are left out of the output. |
| `--package` | string | Package name for the `changeset` format. Defaults to `name` in `package.json`. |
| `--owner`, `--repo`, `--token` | string | As for `describe`. |

PR numbers come from merge commits and `(#N)` squash suffixes. A PR without a record block is listed on stderr as missing. See [CHANGELOG.md](CHANGELOG.md).

## init

```
node dist/cli.js init [--force]
```

Writes `.describerc.json` in the current directory with a starter template. Refuses to overwrite an existing file unless `--force` is given.

## Exit codes

- `0`: success, including skipped PRs.
- `1`: a usage error (unknown command or format, missing `--from`/`--to`, `--update` without `--pr`, existing config without `--force`), or any unexpected error.
