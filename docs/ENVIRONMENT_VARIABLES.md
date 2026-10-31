# ENVIRONMENT_VARIABLES

All `process.env` reads flow through `src/env.ts` (`@t3-oss/env-core` with zod). Validation is skipped in test mode (`NODE_ENV === "test"` or `BUN_TEST === "1"`).

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | no | GitHub token for Octokit requests. Optional for local diff mode. |
| `GITHUB_REPOSITORY` | no | `owner/repo`, used to derive owner and repo. |
| `MODEL` | no | Overrides `config.model`; selects the ggml-node model id. |
| `MOCK_DATA` | no | `"true"` or `"1"` selects the mock provider (no model download). |
| `PR_NUMBER` | no | Pull request number, used by the GitHub Action path (`src/action.ts`). |
| `GGML_NODE_CACHE_DIR` | no | Cache directory for the downloaded model (set by the action workflow). |
| `NODE_ENV` / `BUN_TEST` | no | When set to `test`/`"1"`, env validation is skipped. |

## Precedence

- CLI flags (`--token`, `--owner`, `--repo`) win over env.
- `MODEL` env wins over `config.model`; unset falls back to `DEFAULT_MODEL`.
- `MOCK_DATA === "true"` forces the mock provider regardless of `config.provider`.
