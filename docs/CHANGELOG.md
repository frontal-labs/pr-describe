# CHANGELOG

The `changelog` CLI command is a stub (`src/cli.ts:193`):

```
changelog --from <from> --to <to> (stub)
```

It prints a placeholder and is not implemented end-to-end.

## Changelog rendering (library)

The rendering logic lives in `src/changelog/index.ts` and operates on `RecordWithPR[]` (change records paired with PR numbers and titles).

### Options

| Option | Type | Description |
|--------|------|-------------|
| `from` | string | Start ref/tag. |
| `to` | string | End ref/tag. |
| `audience` | `"customer" \| "developer" \| "internal"` | Filters summaries; records with `audience === "internal"` are always excluded from output. |
| `format` | `"markdown" \| "github-release" \| "changeset"` | Output format. |
| `polish` | boolean | Reserved; not yet applied. |

### Renderers

- `renderMarkdown(records, options)` — Markdown with a `## [from..to]` range header and `### Type` sections.
- `renderGitHubRelease(records, options)` — Same structure without the range header, suitable for GitHub release notes.
- `renderChangeset(records, options)` — Changeset format (`---` / `"type": patch` / `---` blocks).
- `renderSlackPayload(records, options)` — JSON payload with `prelude` and `sections` for Slack.

### Type order

Records are grouped in this order: `breaking`, `feature`, `fix`, `perf`, `refactor`, `docs`, `internal`. A record with `breaking === true` is placed under `breaking` regardless of its `type`.

## Fixtures

`tests/fixtures/` holds `.diff` + `.json` pairs used by `tests/fixtures.test.ts` and the eval harness. Each fixture's JSON declares expected `type`, `scope`, and `breaking`.
