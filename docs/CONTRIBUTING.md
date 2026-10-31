# CONTRIBUTING

Thanks for contributing to `@frontal-labs/pr-describe`.

## Development

```sh
bun install
bun run build
bun test
bun run lint
```

`bun test` runs unit, end-to-end and fixture tests with no model and no network. `bun run eval` runs the real model and is slow. See [TESTING.md](TESTING.md).

## Source layout

All source is in `src/`, one directory:

- `constants.ts`: every constant (limits, prompts, patterns, the enum lists). No imports from `src/`.
- `types.ts`: every shared type. Data shapes are zod schemas, and the types are inferred from them. Plain interfaces are used only for contracts such as `Provider`.
- `cli.ts`: the command line. `args.ts`: argument parsing and per-command checks. `describe.ts`: the describe pipeline.
- `generate.ts`: generation and grounding. `grounding.ts`: the deterministic checks.
- `providers.ts`: the model providers. `chunk.ts`: diff chunking.
- `collect.ts`: GitHub and git input (responses are parsed with zod), PR update, changelog reads. `filter.ts`: ignore globs.
- `markers.ts`: the marker block. `record.ts`: record serialization. `loader.ts`: config loading.
- `changelog.ts`: the four changelog formats. `env.ts`: environment variables. `validate.ts`: zod error formatting. `runtime.ts`: git and file helpers.

Rules: a new constant goes in `constants.ts`. A new shared shape goes in `types.ts` as a zod schema, with the type inferred from it. Validate anything that crosses a boundary (files, environment, GitHub responses, model output, command-line flags) with a schema, not a cast.

## Commit messages

Conventional commits enforced by commitlint:

```
feat: add changelog command
fix: preserve human edits in PR description
docs: update README quickstart
```

## Pull requests

- Keep PRs focused; one logical change per PR.
- Add a changeset for user-facing changes: `bunx changeset`.
- Ensure `bun test` and `bun run lint` pass before requesting review.

## Releasing

Changesets drive releases. Merging a PR with a changeset into `main` triggers the Release workflow, which bumps versions and opens a release PR.

## Docs

Docs live in `docs/` as UPPERCASE_SNAKE_CASE markdown files. `docs/README.md` is the landing page, and the root `README.md` links to it. When behavior changes, update the doc that describes it in the same PR.
