# @frontal-labs/pr-describe documentation

Drafts PR descriptions and change records from a diff. The model runs in-process with [`ggml-node`](https://www.npmjs.com/package/ggml-node): no API key, no hosted backend, no telemetry.

## Status

Not published to npm yet. Build from source (see [QUICKSTART.md](QUICKSTART.md)).

## What it does

- **`describe`** reads a PR diff (from GitHub, or locally via `git diff` with `--base`/`--head`), generates a summary and a change record with a small local model, and renders the description with a hidden marker block. It prints the result. With `--update` it also replaces the PR body on GitHub. Without `--update` nothing is written to GitHub.
- **`changelog`** reads the change records stored in the PRs merged between two refs and renders release notes as Markdown, GitHub Release notes, a changeset, or a Slack payload.
- **`init`** writes a starter `.describerc.json` into the repository root.

## Reading order

| Doc | Purpose |
|-----|---------|
| [QUICKSTART.md](QUICKSTART.md) | Install, build, and run your first description |
| [CLI_REFERENCE.md](CLI_REFERENCE.md) | Every command and flag |
| [CONFIGURATION.md](CONFIGURATION.md) | `.describerc.json` option reference |
| [GITHUB_ACTION.md](GITHUB_ACTION.md) | The composite GitHub Action and its inputs |
| [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) | Environment variables and precedence |
| [MODELS_AND_ACCURACY.md](MODELS_AND_ACCURACY.md) | Model ids, defaults, safeguards, measured accuracy |
| [OUTPUT_FORMAT.md](OUTPUT_FORMAT.md) | The change record, the marker block and the description sections |
| [CHANGELOG.md](CHANGELOG.md) | The `changelog` command and its formats |
| [TESTING.md](TESTING.md) | Unit, end-to-end and eval tests |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Common problems and fixes |
| [KNOWN_ISSUES.md](KNOWN_ISSUES.md) | Current limitations |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Development setup and conventions |

## License

MIT. See [LICENSE.md](../LICENSE.md).
