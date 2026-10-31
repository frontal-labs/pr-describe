# CHANGELOG

The `changelog` command builds release notes from the change records stored in the pull requests merged between two refs.

```
node dist/cli.js changelog --from v1.0.0 --to v1.1.0 --format markdown
```

## Where records come from

A record exists only for a PR that `describe --update` has written. The record is the JSON block inside the PR's marker block. The command reads the commits between the two refs (via GitHub's compare API), takes PR numbers from merge commits (`Merge pull request #N`) and squash suffixes (`(#N)`), and reads each PR's record.

- A PR without a readable record is listed on stderr as missing. It is not guessed at.
- A `(#N)` that is not a PR in this repository (for example an issue) is treated as missing.
- Any other GitHub error stops the command.
- The compare API returns at most 250 commits. Larger ranges are truncated.

## Formats

| `--format` | Output |
|------------|--------|
| `markdown` (default) | A `## [from..to]` heading, then `### Type` sections with one bullet per PR. Each bullet links to the PR. |
| `github-release` | The same sections without the range heading, for GitHub release notes. |
| `changeset` | One changeset file: a frontmatter block with the package name and a bump, then one bullet per change. The bump is `minor` when there is a feature or a breaking change, and `patch` otherwise. Needs a package name: `--package`, or `name` from `package.json`. |
| `slack` | A JSON object with `prelude` and `sections`, for a Slack message. |

## Options

| Flag | Meaning |
|------|---------|
| `--from`, `--to` | The two refs. Both required. |
| `--audience` | `customer`, `developer` or `internal`. Chooses which summary is printed. |
| `--package` | Package name for the changeset format. |

Records whose audience is `internal` are left out of every format.

## Type order

Groups appear in this order: `breaking`, `feature`, `fix`, `perf`, `refactor`, `docs`, `internal`. A record with `breaking: true` goes under `breaking`, whatever its type.
