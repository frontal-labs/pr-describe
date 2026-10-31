---
"@frontal-labs/pr-describe": minor
---

Replace the Anthropic and OpenAI providers with an in-process model via `ggml-node`. No API key is needed, and the model runs on the machine that runs the action. Set `model` to `qwen2.5-1.5b` (default), `qwen2.5-0.5b` or `smollm2-360m`. The `api_key_env` option and the `ANTHROPIC_API_KEY` and `OPENAI_*` variables are removed.

Generated descriptions now use fixed headings from `sections`, scopes are chosen from the changed paths, and links not present in the input are dropped.

Config is read from `.describerc.json` in the repository root (JSON). `init` writes it. Change records are written as JSON (`.changes/<pr>.json`), and the hidden record block in the PR body is JSON too.
