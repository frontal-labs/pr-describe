# CONTRIBUTING

Thanks for contributing to `@frontal-labs/pr-describe`! This is an open-source Frontal tool.

## Development

```sh
bun install
bun run build
bun test
bun run lint            # biome check src tests
```

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

Docs live in `docs/` as UPPERCASE_SNAKE_CASE markdown files. `docs/INDEX.md` is the landing page; `README.md` links to it.
