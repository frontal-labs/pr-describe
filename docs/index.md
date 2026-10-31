# PR Describe

`@frontal-labs/pr-describe` drafts PR descriptions and structured change records from the diff, and turns those records into changelogs.

## Features

- Drafts a PR description from the unified diff, commit messages, linked issues and the repo PR template.
- Produces a structured change record (type, scope, audience, breaking, evidence, links) that survives squash merges via a hidden YAML block.
- Protects human edits inside the marker block; adds a "Regenerate description" checkbox instead of overwriting.
- Turns records into CHANGELOG.md sections, GitHub Release bodies, changeset files and Slack payloads.
- Runs the model in-process. No API key, no hosted backend, no telemetry.

## Quickstart

```sh
bunx @frontal-labs/pr-describe init
```

## Configuration

Configuration lives in `.frontal/pr-describe.yml`:

```yaml
provider: ggml-node          # ggml-node (in-process model) | mock
model: qwen2.5-1.5b          # qwen2.5-0.5b | qwen2.5-1.5b | smollm2-360m
sections: [summary, changes, testing, risks]
tone: concise
scopes:
  billing: ["src/billing/**"]
  ui: ["src/components/**"]
ignore: ["**/*.snap", "dist/**"]
skip_labels: [dependencies, skip-describe]
max_diff_lines: 4000
```

## Model

Inference runs in-process with [ggml-node](https://www.npmjs.com/package/ggml-node) on the machine that runs the command or action. There is no API key and no network call to a model provider.

- **qwen2.5-1.5b** (default): better scope and type accuracy, about 1.1 GB on disk, about 1.3 GB RAM (ggml-node estimate).
- **qwen2.5-0.5b**: smaller and faster, weaker output.
- **smollm2-360m**: smallest, weakest output.
- **Mock**: set `MOCK_DATA=true` to skip the model (used in tests).

The model downloads on first use into ggml-node's cache. Set `GGML_NODE_CACHE_DIR` to control where. Requires Node.js 20 or later.

## Privacy

- No data leaves the machine running the command. The model runs locally and makes no network calls to a model provider.
- The `ignore` list filters lockfiles, generated code, vendored files and snapshots before anything reaches the model.

## CLI

```sh
pr-describe describe --pr 42
pr-describe describe --base main --head feature/x --dry-run
pr-describe describe --pr 42 --write-file
pr-describe changelog --from v0.1.0 --to v0.2.0 --format github-release
```

## GitHub Action

The action runs on `pull_request` (opened, synchronize) and on `/describe` comments. It ships compiled `dist/`.

See `.github/workflows/pr-describe.yml`.

## Troubleshooting

- **"Could not determine owner/repo"** — set `GITHUB_REPOSITORY=owner/repo` or pass `--owner`/`--repo`.
- **"Unknown model"** — `model` must be one of `qwen2.5-0.5b`, `qwen2.5-1.5b` or `smollm2-360m`.
- **"Rate limit exceeded"** — pass a token via `--token` or `GITHUB_TOKEN`.
- **Description not updated** — a human edited the block; a "Regenerate description" checkbox was added. Tick it or comment `/describe` to regenerate.

## License

MIT