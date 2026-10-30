# PR Describe

`@frontal-labs/pr-describe` drafts PR descriptions and structured change records from the diff, and turns those records into changelogs.

## Features

- Drafts a PR description from the unified diff, commit messages, linked issues and the repo PR template.
- Produces a structured change record (type, scope, audience, breaking, evidence, links) that survives squash merges via a hidden YAML block.
- Protects human edits inside the marker block; adds a "Regenerate description" checkbox instead of overwriting.
- Turns records into CHANGELOG.md sections, GitHub Release bodies, changeset files and Slack payloads.
- Runs entirely on your own model API key. No hosted backend, no telemetry.

## Quickstart

```sh
bunx @frontal-labs/pr-describe init
```

## Configuration

Configuration lives in `.frontal/pr-describe.yml`:

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

### Anthropic (default)

Set the API key:

```sh
export ANTHROPIC_API_KEY=sk-ant-...
```

Or point `api_key_env` at a different env var.

### OpenAI

```sh
export OPENAI_API_KEY=sk-...
```

### OpenAI-compatible (self-hosted models)

```yaml
provider: openai-compatible
api_key_env: MY_MODEL_KEY
```

Set `OPENAI_BASE_URL` to your endpoint, e.g. `http://localhost:8080/v1`.

### Mock (no key)

```sh
export MOCK_DATA=true
```

Used by tests and the fixture workflow.

## Privacy

- Bring your own key. Data is sent only to the provider you configured.
- The `ignore` list filters lockfiles, generated code, vendored files and snapshots before anything reaches the model.
- Self-hosted models via `openai-compatible` keep data on your own infrastructure.

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
- **"Anthropic API key not set"** — set `ANTHROPIC_API_KEY` or the env var named in `api_key_env`.
- **"Rate limit exceeded"** — pass a token via `--token` or `GITHUB_TOKEN`.
- **Description not updated** — a human edited the block; a "Regenerate description" checkbox was added. Tick it or comment `/describe` to regenerate.

## License

MIT