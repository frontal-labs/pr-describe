# TROUBLESHOOTING

## "Could not determine owner/repo"

Set `GITHUB_REPOSITORY=owner/repo` or pass `--owner`/`--repo`. Required for the GitHub path (`collectFromPRNumber`).

## Fork PR skipped

Fork PRs are skipped by default ("Fork PRs are not supported yet") because the action would need `pull_request_target` to read the base repo's secrets. Use local mode (`--base`/`--head`, no `--pr`) for forks.

## "No non-ignored files in diff"

The diff only touched ignored paths (lockfiles, `dist/`, `vendor/`, `*.snap`, etc.). Adjust `ignore` in `.describerc.json` or confirm the diff is non-empty.

## "Generation failed after retries"

The model output failed the JSON schema twice. Common with very small models (`smollm2-360m`) or huge diffs. Switch to `qwen2.5-1.5b`, increase `large_change_threshold`, or narrow the diff.

## First run is slow / 1.1 GB download

ggml-node downloads the default model on first use. Cache `.ggml-cache` in CI. Use `MOCK_DATA=true` to skip the download entirely.

## Description truncated to 250 words

Non-large changes (`totalLines <= large_change_threshold`, default 500) get truncated. Raise `large_change_threshold` or mark the change as large.

## Human-edited block preserved

If the PR body already contains a marker block whose description was edited, the block is kept and a `- [ ] Regenerate description` checkbox is appended instead of replacing the block.
