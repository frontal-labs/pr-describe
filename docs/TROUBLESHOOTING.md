# TROUBLESHOOTING

Messages are printed to stderr, and the command exits `1`. Skips are printed to stdout and exit `0`.

## Usage errors

- **"Could not determine owner/repo. Set GITHUB_REPOSITORY or pass --owner/--repo."** PR mode and `changelog` need the repository. Set `GITHUB_REPOSITORY=owner/repo` or pass `--owner` and `--repo`.
- **"--update needs --pr <number>"** `--update` writes to a PR, so it needs one. Local ranges cannot be updated.
- **"--pr must be a number, got ..."** Pass the PR number only.
- **"changelog needs --from <tag> and --to <tag>"** Pass both refs.
- **"Unknown format: ..."** / **"Unknown audience: ..."** Use one of the listed values. See [CLI_REFERENCE.md](CLI_REFERENCE.md).
- **".describerc.json already exists. Pass --force to overwrite it."** `init` will not overwrite a config by default.
- **"Unknown command: ..."** Commands are `describe`, `changelog` and `init`.

## Configuration

- **"... is not valid JSON"** / **"... must contain a JSON object"** Fix the file. It must be one JSON object. See [CONFIGURATION.md](CONFIGURATION.md).
- **"... is invalid: Unrecognized key: ..."** Remove the key. Keys from earlier versions (`tone`, `max_diff_lines`, `api_key_env`) are errors now.
- **"... is invalid: ..."** with a key name, for example `sections` or `large_change_threshold`. The message says what the allowed values are.
- **"GITHUB_REPOSITORY must look like owner/repo"**, **"GITHUB_API_URL must be a URL"** Fix the environment variable. See [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md).
- **"Unknown provider: ..."** `provider` must be `ggml-node` or `mock`. Configs from the removed Anthropic and OpenAI providers need updating.
- **"Unknown model ..."** `model` must be `qwen2.5-0.5b`, `qwen2.5-1.5b` or `smollm2-360m`.

## Skips (exit 0)

- **"Skipping: fork from ..."** Fork PRs are not supported. Use local mode for a fork's branch.
- **"Skipping: has skip label"** A label in `skip_labels` matched.
- **"Skipping: no non-ignored files in diff"** Every changed file matched `ignore` or the built-in list. Check the paths.

## Generation

- **"Diff is too large to summarize: ..."** The diff needs more than 20 summary calls. Split the PR, or add generated or vendored paths to `ignore`.
- **"Generation failed after retries: ..."** The model's output failed validation twice, usually an empty summary. Try the default model, or a smaller diff.
- **"Needs review: type and/or scope"** The model's two checks disagreed. Check the field before you publish.
- **"Dropped N sentence(s) ..."** Some model sentences named things the input does not contain, so they were removed. Read the result. Removed claims may have been the only description of a change.
- **The first run is slow and downloads about 1.1 GB.** The default model downloads on first use. Cache `.ggml-cache` in CI, or use `MOCK_DATA=true` for a dry test.

## Existing PR body

- **"PR description was edited by human; ..."** A person changed the block, so it was kept. The regenerate checkbox was added. To regenerate, delete the marker block and run again.

## Changelog

- **"No change record found in the PR body for: #N"** That PR has no record block, usually because `describe --update` never ran for it. The notes leave it out on purpose.
- **"The changeset format needs a package name (--package)"** Pass `--package`, or run from a directory with a `package.json` that has a `name`.

## GitHub errors

- **403 when running `--update`** The token lacks `pull-requests: write`. In Actions, set `permissions: pull-requests: write`.
- **404 on a PR** The PR number is wrong, the repository is wrong, or the token cannot see the repository.
