# GitHub issue templates

## Template location

This directory contains the issue templates used by the repository:

- `bug-report.yml` — for reporting bugs
- `feature-request.yml` — for suggesting new features
- `docs.yml` — for documentation improvements
- `config-issue.yml` — for configuration or action problems
- `question.yml` — for asking questions

## Adding a new template

Create a new `.yml` file in this directory following the existing pattern:

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