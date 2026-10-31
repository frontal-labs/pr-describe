# KNOWN_ISSUES

- `changelog` is a stub; the CLI command prints a placeholder and does not generate a changelog. Grouping/rendering functions exist in `src/changelog/index.ts` but are not wired to a CLI path.
- `pr-describe` prints descriptions; it does **not** update PRs on GitHub. The action writes `.changes/pr-body.md`, `.changes/record.json`, and `.changes/description.md` for consumers to use.
- Fork PRs are skipped by default.
- Not published to npm yet.
- `tone` is stored in config but not interpreted by the generator.
- `polish` option exists on changelog options but is not applied.
- The default model (~1.1 GB) downloads on first run; offline use requires `MOCK_DATA=true` or a pre-populated cache.
- `max_diff_lines` is present in the config type but chunking uses the fixed `4000` token budget in `src/cli.ts`/`src/action.ts`, not `config.max_diff_lines`.
