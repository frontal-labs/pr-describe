# TESTING

## Test runner

Bun's built-in test runner (`bun:test`). Run:

```sh
bun test
```

## Test files

- `tests/unit.test.ts` — Unit tests for `filter`, `chunk`, `markers`, `record`, `generateDescription`, scope/path resolution, type-from-paths, chunk model-call cap, config loading, and record output.
- `tests/fixtures.test.ts` — Validates every fixture in `tests/fixtures/` (`.diff` + `.json` pairs) against the change record schema. Requires at least 10 fixtures.
- `tests/eval.ts` — Runs the real ggml-node model over all fixtures and reports type/scope/breaking accuracy plus timing. Writes `tests/fixtures/eval-report.json`.

```sh
bun run eval            # default model
EVAL_MODEL=qwen2.5-0.5b bun run eval
```

## Lint

```sh
bun run lint            # biome check src tests
```

## Writing tests

- Prefer `describe`/`it` from `bun:test`.
- Use the `mock` provider or hand-rolled fake `Provider` objects rather than the real model in unit tests.
- Add fixtures as `<name>.diff` + `<name>.json` under `tests/fixtures/`.
