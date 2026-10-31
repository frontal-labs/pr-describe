# OUTPUT_FORMAT

## Marker block

Generated PR bodies are wrapped in HTML-style marker comments so re-runs can detect and preserve human edits:

```
<!-- frontal:start hash=<sha256> -->
## Summary
...

## Changes
- Updated src/api.ts

```json
{
  "type": "fix",
  "audience": "internal",
  "scope": "core",
  "breaking": false,
  "summary_customer": "...",
  "summary_internal": "...",
  "evidence": ["src/api.ts"],
  "links": [],
  "changes": ["Updated src/api.ts"],
  "testing": [...],
  "risks": [...]
}
```
...
<!-- frontal:end -->
```

- `START_MARKER = "<!-- frontal:start"` — the hash (`hash=<sha256>`) is computed over the description text.
- A JSON code block holds the full change record.
- `END_MARKER = "<!-- frontal:end -->"`.

On re-run:
- If the block exists and its hash matches the new description, the previous block is kept unchanged.
- If the block exists and the description differs (human-edited), the block is preserved and a `- [ ] Regenerate description` checkbox is appended.
- Otherwise the block is replaced or inserted at the end of the body.

## Change record schema

`ChangeRecord` (schema version 1):

| Field | Type | Notes |
|-------|------|-------|
| `type` | `"feature" \| "fix" \| "perf" \| "refactor" \| "docs" \| "breaking" \| "internal"` | What the change does. |
| `audience` | `"customer" \| "developer" \| "internal"` | Who the summary is for. |
| `scope` | `string` | Area name; resolved from `scopes` globs or defaults to `"core"`. |
| `breaking` | `boolean` | Whether the change removes/changes behavior callers depend on. |
| `summary` | `string` | One or two plain sentences. |
| `summary_customer` | `string` | Customer-facing summary. |
| `summary_internal` | `string` | Internal-facing summary. |
| `changes` | `string[]` | Short sentences naming changed files/symbols. |
| `testing` | `string[]` | Testing notes. |
| `risks` | `string[]` | Risk notes. |
| `evidence` | `string[]` | Exact file paths and symbols copied from the diff. |
| `links` | `string[]` | Links that appear in the prompt (issue/PR references). |
| `schema` | `1` | Internal; stripped from `recordToJson()` output. |

`recordToJson()` pretty-prints the record without the `schema` field and is written to `.changes/<pr>.json` when `--write-file` is set.

## Description sections

Rendered in the order given by `config.sections`, using fixed headings:

| Section | Heading | Source |
|---------|---------|--------|
| `summary` | `## Summary` | Model summary text |
| `changes` | `## Changes` | Bulleted `changes` items, or `- None` |
| `testing` | `## Testing` | Bulleted `testing` items, or `- None` |
| `risks` | `## Risks` | Bulleted `risks` items, or `- None` |

Sections `breaking` and `links` have no model field and are skipped by `renderDescription()`.

## Large changes

When total diff lines exceed `large_change_threshold` (default 500), the description is **not** truncated to 250 words and chunk reduction is enabled. Otherwise the description is truncated to 250 words.
