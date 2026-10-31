# MODELS_AND_ACCURACY

## Supported models

`ggml-node` can load these model ids from its registry:

| Model id | Notes |
|----------|-------|
| `qwen2.5-0.5b` | Smallest; fastest, least accurate. |
| `qwen2.5-1.5b` | Default. Best balance of speed and accuracy. |
| `smollm2-360m` | Smallest footprint; lowest accuracy. |

`resolveModel()` validates the id against this list and throws for anything else (including removed remote providers such as `anthropic`/`openai`).

## Default

`DEFAULT_MODEL = "qwen2.5-1.5b"`. When `config.model` and the `MODEL` env var are both unset, the provider uses this default.

## Context window

`CONTEXT_SIZE = 8192` tokens. The diff is cut to ~16,000 characters before prompting (~4,000 tokens at 4 chars/token) to stay inside the window alongside instructions and output.

## Output token cap

`MAX_OUTPUT_TOKENS = 1536` per request. Temperature is fixed at `0.1`.

## Mock provider

`MOCK_DATA=true` selects the `mock` provider, which returns a fixed change record without loading any model. Use for offline development and CI smoke tests. The mock output passes the record validator.

## Accuracy

- The model output is constrained to a JSON schema (`RECORD_SCHEMA`) with up to 2 retry attempts on validation failure.
- `typeFromPaths()` hard-codes `docs` for docs-only changes and `internal` for CI/lockfile-only changes, since the small model is weak at this classification.
- `resolveScope()` picks the scope whose globs match the most changed files; falls back to the model's answer when it matches a configured scope name, otherwise `"core"`.
- `filterClaimsByEvidence()` drops description bullets not backed by an evidence entry, to avoid unsupported claims.
- Grounding drops links not present in the prompt and placeholder evidence (`none`, `n/a`, `na`, `null`, `-`).

## First-run download

The default model is about 1.1 GB and downloads on first use. Cache `.ggml-cache` in CI to avoid re-downloading.
