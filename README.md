# @frontal-labs/pr-describe

Drafts PR descriptions and structured change records from the diff, and turns those records into changelogs. Runs entirely on your own model API key — no hosted backend, no telemetry.

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
provider: anthropic          # anthropic | openai | openai-compatible
model: claude-sonnet-5-5
api_key_env: PR_DESCRIBE_API_KEY
sections: [summary, changes, testing, risks]
tone: concise
scopes:
  billing: ["src/billing/**"]
  ui: ["src/components/**"]
ignore: ["**/*.snap", "dist/**"]
skip_labels: [dependencies, skip-describe]
max_diff_lines: 4000
```

## Provider setup

- **Anthropic** (default): set `ANTHROPIC_API_KEY` or the env var named in `api_key_env`.
- **OpenAI**: set `OPENAI_API_KEY` and optionally `OPENAI_BASE_URL` for self-hosted models.
- **Mock**: set `MOCK_DATA=true` to run without a model key (used in tests).

## Privacy

- Bring your own key. No data is sent anywhere except the provider you configured.
- The `ignore` list filters lockfiles, generated code, vendored files and snapshots before anything reaches the model.
- Self-hosted models via `openai-compatible` keep data on your own infrastructure.

## GitHub Action

See `.github/workflows/pr-describe.yml`. The action ships compiled `dist/`.

## Testing

```sh
bun test
```

Unit tests cover filter, chunk, markers (including edit-detection cases) and record validation. A separate fixture run (`.github/workflows/fixtures.yml`) reports type accuracy against the real provider.

## License

MIT// smoke
