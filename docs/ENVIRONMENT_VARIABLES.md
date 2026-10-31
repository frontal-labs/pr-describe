# ENVIRONMENT_VARIABLES

All reads of `process.env` in the tool go through `src/env.ts`, which validates them with `@t3-oss/env-core` and zod, once at startup. Validation is skipped when `NODE_ENV` is `test` or `BUN_TEST` is `1`.

| Variable | Read by | Description |
|----------|---------|-------------|
| `GITHUB_TOKEN` | `env.ts` | GitHub token for API calls. Used by PR mode, `--update` and `changelog`. |
| `GITHUB_REPOSITORY` | `env.ts` | Must look like `owner/repo`. Needed for PR mode and `changelog` unless `--owner`/`--repo` are given. |
| `GITHUB_API_URL` | `env.ts` | Must be a URL. Default: `https://api.github.com`. Set it for GitHub Enterprise, or to point the tool at a test server. |
| `MODEL` | `env.ts` | Model id. A non-empty value overrides `model` in the config. Checked when the model loads: an unknown id is an error that lists the supported ones. |
| `MOCK_DATA` | `env.ts` | `true`, `1`, `yes` or `on` forces the mock provider. Other values leave it off. |
| `GGML_NODE_CACHE_DIR` | ggml-node | Where the downloaded model is kept. Not validated by `env.ts`. |

## Precedence

- `--token` beats `GITHUB_TOKEN`.
- `--owner` and `--repo` beat `GITHUB_REPOSITORY`.
- A non-empty `MODEL` beats `model` in the config, which beats the default.
- `MOCK_DATA` beats `provider` in the config.

## Not used

`PR_NUMBER` was read only by the removed `src/action.ts`. The action passes the PR number as the `--pr` flag.
