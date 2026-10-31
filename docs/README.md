# @frontal-labs/pr-describe documentation

Drafts PR descriptions and change records from a diff. The model runs in-process with [`ggml-node`](https://www.npmjs.com/package/ggml-node): no API key, no hosted backend, no telemetry.

## Status

Not published to npm yet. It prints descriptions; it does not update PRs, and `changelog` is not implemented.

## What this does

- `describe` — reads a PR diff (locally via `git diff`, or from GitHub via the Octokit API), generates a summary + change record with a small local LLM, and renders a new PR body wrapped in marker comments.
- `changelog` — stub command; prints a placeholder message. Grouped rendering exists in `src/changelog/index.ts` but is not wired to a CLI path.
- `init` — writes a `.describerc.json` config file into the repository root.

## How to read these docs

| Doc | Purpose |
|-----|---------|
| [README.md](README.md) | This landing page |
| [QUICKSTART.md](QUICKSTART.md) | Install, build, and run your first description |
| [CONFIGURATION.md](CONFIGURATION.md) | `.describerc.json` option reference |
| [CLI_REFERENCE.md](CLI_REFERENCE.md) | Every command and flag |
| [GITHUB_ACTION.md](GITHUB_ACTION.md) | Using the composite GitHub Action |
| [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) | `GITHUB_TOKEN`, `MODEL`, `MOCK_DATA`, and friends |
| [MODELS_AND_ACCURACY.md](MODELS_AND_ACCURACY.md) | Supported model ids, defaults, and accuracy notes |
| [OUTPUT_FORMAT.md](OUTPUT_FORMAT.md) | Change record schema and marker block format |
| [CHANGELOG.md](CHANGELOG.md) | Changelog command and renderers |
| [TESTING.md](TESTING.md) | Unit tests, fixtures, and eval harness |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Common problems and fixes |
| [KNOWN_ISSUES.md](KNOWN_ISSUES.md) | Current limitations |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Development setup and conventions |

## License

MIT. See [LICENSE.md](../../LICENSE.md).
