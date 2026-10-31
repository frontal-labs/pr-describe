# TESTING

## Commands

```sh
bun test                # unit, end-to-end and fixture tests. No model, no network.
bun run lint            # Biome, on src and tests
bun run eval            # the real model over the fixtures. Slow. Writes tests/fixtures/eval-report.json.
EVAL_MODEL=qwen2.5-0.5b bun run eval   # pick another model for the eval
```

## Test files

- `tests/unit.test.ts`: pure logic. Filtering, chunking, markers (hashing, edit detection, round trip), records, the provider layer, generation with a fake provider (grounding, gated sections, the second opinion, review flags), the describe pipeline with fake collectors, changelog rendering, configuration loading, and argument parsing.
- `tests/e2e.test.ts`: runs the real CLI as a subprocess against a local fake GitHub API (`GITHUB_API_URL` points at it). The model is the mock provider. It covers writing a PR body with `--update`, `--dry-run`, refusing a human-edited block, the `--update` usage error, and changelog generation and errors. No real PR is touched.
- `tests/schemas.test.ts`: the zod schemas directly. What the config, model output, change records, GitHub responses and CLI arguments accept and reject, and the defaults they fill.
- `tests/fixtures.test.ts`: checks that each fixture's expected values are valid records. Requires at least 10 fixtures.
- `tests/eval.ts`: the real model over every fixture. Reports type, scope and breaking accuracy, how many fields were flagged for review, how many sentences were dropped, and whether any claim in the output is missing from the input.

## Fixtures

`tests/fixtures/` holds `<name>.diff` and `<name>.json` pairs. The JSON gives the expected `type`, `scope` and `breaking`, and can give a `title`. A title matters for breaking changes, because `breaking` is kept only when the PR text says so.

To add one, write a unified diff with `diff --git` headers, then the expectations. Keep it to one clear change. Ambiguous changes make the accuracy numbers meaningless.

## Writing tests

- Use `describe` and `it` from `bun:test`.
- Use `getProvider("mock")` or a hand-written `Provider` for unit tests. Never call the real model from a unit test.
- For the GitHub side, use `runDescribe` with a fake `collect`, or the fake API in `e2e.test.ts`.
