---
"@frontal-labs/pr-describe": minor
---

- Config is `.describerc.json` (JSON), validated by a strict zod schema: unknown keys and bad values are errors. The marker block and change records are JSON. Marker tags are `describe:start` / `describe:end`.
- `describe --update` (and the action's `update` input, off by default) replaces the PR body. A human-edited block is kept, and detection now works.
- `changelog` builds release notes from the PR records between two refs, in Markdown, GitHub Release, changeset or Slack formats.
- Generation is grounded: changed files and counts come from code, summary sentences must name only things in the input, Testing and Risks need a signal, and `type`/`scope` get a second check that flags disagreement.
- `--update` and `changelog` are covered by an end-to-end test against a fake GitHub API.
