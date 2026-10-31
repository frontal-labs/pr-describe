# OUTPUT_FORMAT

## Marker block

`describe` writes its output into a block bounded by two HTML comments. Everything inside is generated, except what a person edits.

```
<!-- describe:start hash=<sha256> -->
```json
{
  "audience": "developer",
  "breaking": false,
  "evidence": ["src/billing/pricing.ts"],
  "links": [],
  "scope": "billing",
  "summary_customer": "Fixes rounding of prices to whole cents",
  "summary_internal": "Fixes rounding of prices to whole cents",
  "type": "fix"
}
```

## Summary
...

## Changes
- `src/billing/pricing.ts` (+1 −1)
<!-- describe:end -->
```

- The start comment holds `hash=<sha256>`: the SHA-256 of the description text (everything after the JSON block).
- The JSON block is the change record (see below), with no `schema` field.
- The end comment is `<!-- describe:end -->`.

### Re-runs

On each run the tool hashes the current description and compares it with the stored hash:

- **Same hash, or no block yet:** the block is replaced (or added at the end of the body).
- **Different hash (a person edited it):** the block is kept exactly as it is. A `- [ ] Regenerate description` checkbox is added inside the block. The model does not run, and nothing is overwritten. Tick the box in a future version to request regeneration (not implemented yet; delete the block to regenerate).

## Description sections

Sections render in the order given by `sections`, under fixed headings:

| Section | Heading | Content |
|---------|---------|---------|
| `summary` | `## Summary` | Model sentences whose names, paths and numbers all appear in the input. If none survive, `Updates N file(s).` |
| `changes` | `## Changes` | Written by code: one bullet per changed file with its added and removed line counts. Never from the model. |
| `testing` | `## Testing` | Only when a test file changed or the PR text mentions tests. The model's grounded items come first. If it names none, each changed test file is listed as `Test file changed: \`path\``. Otherwise `- Not stated`. |
| `risks` | `## Risks` | Only for a breaking marker, a migration, schema or config file. Otherwise `- Not stated`. |

When the model's second check disagreed about `type` or `scope`, the description starts with `> **Needs review:** ...`.

`breaking` and `links` are not rendered as sections.

## Change record

The record is the JSON shown above. It is also the content of `.changes/<pr>.json` with `--write-file`.

| Field | Type | Notes |
|-------|------|-------|
| `type` | `feature` \| `fix` \| `perf` \| `refactor` \| `docs` \| `breaking` \| `internal` | Code decides `docs` (only documentation changed), and `internal` (only CI, lockfiles, build config or tests changed). Otherwise the model decides. |
| `audience` | `customer` \| `developer` \| `internal` | Who the summary is for. Missing values become `internal`. |
| `scope` | string | Resolved from `scopes` globs, see [CONFIGURATION.md](CONFIGURATION.md). |
| `breaking` | boolean | True only when the model says so and the PR text contains the word "breaking". |
| `summary_customer` | string | Grounded summary for customers. Falls back to the grounded summary. |
| `summary_internal` | string | Grounded summary for developers. Falls back to the grounded summary. |
| `evidence` | string[] | Changed paths, or text found in the input. The `a/` and `b/` diff prefixes are removed. Duplicates are removed. |
| `links` | string[] | Only links found in the input (PR text, commits, issue numbers). |

Internally the record also carries `schema: 1`. It is not written to the JSON output.
