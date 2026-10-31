# @frontal-labs/pr-describe

Drafts PR descriptions and structured change records from the diff, and turns those records into changelogs. Runs the model in-process — no API key, no hosted backend, no telemetry.

## Quickstart

```sh
bunx @frontal-labs/pr-describe init
```

This writes `.frontal/pr-describe.yml` and an example workflow to `examples/`.

## CLI

```sh
# Draft a description for a PR by number (needs GITHUB_TOKEN)
pr-describe describe --pr 42

# Or from a local git range
pr-describe describe --base main --head feature/my-branch

# Dry run (print only)
pr-describe describe --pr 42 --dry-run

# Also write .changes/42.yml
pr-describe describe --pr 42 --write-file

# Generate a changelog between two tags
pr-describe changelog --from v0.1.0 --to v0.2.0 --format markdown
```

## Configuration

`pr-describe init` writes `.frontal/pr-describe.yml`:

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

## GitHub Action

See `.github/workflows/pr-describe.yml`. The action ships compiled `dist/`.

## Testing

```sh
bun test
```

Unit tests cover filter, chunk, markers (including edit-detection cases) and record validation. The weekly fixture workflow (`.github/workflows/fixtures.yml`) checks fixture expectations; it does not call the model.

## License

MIT// smoke
