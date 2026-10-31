# MODELS_AND_ACCURACY

## Supported models

`ggml-node` loads these ids from its registry:

| Model id | Size on disk | Notes |
|----------|--------------|-------|
| `qwen2.5-0.5b` | 491 MB | Fastest. Weakest output. |
| `qwen2.5-1.5b` | 1.1 GB | Default. Best of the three. |
| `smollm2-360m` | 386 MB | Smallest. Weakest output. |

Any other id is rejected with the supported list. There is no 1B model in the registry. A custom GGUF file is not supported yet.

## Decoding and limits

- Temperature `0` and a fixed seed (`42`) on every call, so repeated runs give the same output for the same input.
- Context window: 8192 tokens. The prompt diff is cut to 16,000 characters (about 4000 tokens).
- Output cap: 1536 tokens per request.
- The output shape is enforced by a JSON Schema generated from the zod schema `ModelOutputSchema` (`src/types.ts`). The same schema validates the answer afterwards, so the grammar and the validation cannot drift apart. A run retries once when the output fails validation (for example an empty summary).

## Safeguards

Small models make mistakes. These checks keep the output tied to the input:

1. **Facts from code.** The changed-file list and its line counts are written by code.
2. **Sentence grounding.** A summary sentence stays only if every path, backticked identifier and number in it appears in the diff, the commits or the PR text.
3. **Gated sections.** Testing and Risks appear only when the diff or the PR text shows a signal.
4. **Evidence and links.** Only values found in the input are kept.
5. **Breaking needs text.** `breaking` is cleared unless the PR text contains "breaking".
6. **Path rules.** `docs` and `internal` are decided by file paths. Mixed or product changes go to the model.
7. **Second opinion.** When code cannot decide `type` or `scope`, a second, differently worded call classifies the change. If it disagrees, the field is flagged `Needs review`.
8. **Human review.** `--update` is opt-in. Human edits to the block are kept.

Grounding removes unsupported *concrete* claims. A sentence with no path, identifier or number can still be wrong. The second opinion and review flag catch some of these; they do not catch all.

## Measured accuracy

`bun run eval` on the 16 fixtures in `tests/fixtures/`, with `qwen2.5-1.5b`:

| Measure | Result |
|---------|--------|
| breaking | 16 / 16 |
| type | 11 / 16 |
| scope | 11 / 16 |
| fields flagged for review | 12 / 16 |
| outputs with an ungrounded claim | 0 / 16 |
| sentences dropped by grounding | 0 |

Notes on these numbers:

- The eval configures no scope globs, so scope is always a model guess and always reviewed. Real repositories with `scopes` see far fewer scope reviews.
- 16 fixtures is a small set. Treat the numbers as a rough guide, not a guarantee.
- The test-only rule (`internal`) was added after this run. Fixture `012-tests-only` is now decided by code. This figure has not been re-measured.
- Type accuracy is the weak point. Most type errors are between `feature` and `fix` or `refactor`.

**Treat every generated description as a draft for a person to review.**

## Mock provider

`MOCK_DATA=true` (or `provider: "mock"`) returns a fixed record without loading a model. It is for offline runs and tests. Its output is not a real description.

## First-run download

The default model downloads on first use into ggml-node's cache. Set `GGML_NODE_CACHE_DIR` to choose the directory. The GitHub Action example caches it.
