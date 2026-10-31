# GitHub issue templates

## Template location

This directory contains the issue templates used by the repository:

- `bug-report.md` — for reporting bugs
- `feature-request.md` — for suggesting new features
- `docs.md` — for documentation improvements
- `config-issue.md` — for configuration or action problems
- `question.md` — for asking questions

## Adding a new template

Create a new `.md` file in this directory following the existing pattern:

```yaml
---
name: <template name>
about: <short description>
title: "[<prefix>] "
labels: <label>
assignees: ''
---
```

Then add it to the repository's issue template list.