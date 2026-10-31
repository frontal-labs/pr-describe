# @frontal-labs/pr-describe

## 0.2.0

### Minor Changes

- b49b83d: - Config is `.describerc.json` (JSON), validated by a strict zod schema: unknown keys and bad values are errors. The marker block and change records are JSON. Marker tags are `describe:start` / `describe:end`.
  - `describe --update` (and the action's `update` input, off by default) replaces the PR body. A human-edited block is kept, and detection now works.
  - `changelog` builds release notes from the PR records between two refs, in Markdown, GitHub Release, changeset or Slack formats.
  - Generation is grounded: changed files and counts come from code, summary sentences must name only things in the input, Testing and Risks need a signal, and `type`/`scope` get a second check that flags disagreement.
  - `--update` and `changelog` are covered by an end-to-end test against a fake GitHub API.
- 58ff406: Replace the Anthropic and OpenAI providers with an in-process model via `ggml-node`. No API key is needed, and the model runs on the machine that runs the action. Set `model` to `qwen2.5-1.5b` (default), `qwen2.5-0.5b` or `smollm2-360m`. The `api_key_env` option and the `ANTHROPIC_API_KEY` and `OPENAI_*` variables are removed.

  Generated descriptions now use fixed headings from `sections`, scopes are chosen from the changed paths, and links not present in the input are dropped.

  Config is read from `.describerc.json` in the repository root (JSON). `init` writes it. Change records are written as JSON (`.changes/<pr>.json`), and the hidden record block in the PR body is JSON too.
