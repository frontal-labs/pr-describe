# Contributing

Thanks for contributing to `@frontal-labs/pr-describe`! This is an open-source Frontal tool.

## Development

```sh
bun install
bun run build
bun test
```

## Commit messages

We use conventional commits enforced by commitlint:

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