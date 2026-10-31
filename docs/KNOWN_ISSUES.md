# KNOWN_ISSUES

## Not yet verified

- **Live GitHub writes.** `--update` and `changelog` are tested against a fake API (`tests/e2e.test.ts`) and against a read of a public repository. They have not run against a real PR in a test repository. Do that before turning on `update: "true"` in a workflow.
- **Remote use of the action.** `uses: owner/repo@ref` from another repository has not been run. The same-repository form is the tested one.
- **GitHub Enterprise.** `GITHUB_API_URL` is supported but untested against a real Enterprise server.
- **Live runner.** The action has not been run on a GitHub-hosted runner.

## Accuracy

- **Type is the weak field.** 11 of 16 fixtures were right in the last eval run. Most errors are `feature` versus `fix` or `refactor`.
- **Scope needs globs.** Without `scopes`, scope is a model guess and is flagged for review.
- **Grounding catches concrete claims only.** A sentence with no path, identifier or number can still be wrong.
- **Review flags are noisy.** The second opinion disagreed on 12 of 16 fixtures. That is safe, but it means reviewers will see the flag often.
- **The model is small.** There is no 1B model in ggml-node's registry. Custom GGUF files are not supported.
- **The eval set is small.** 16 fixtures. The numbers are a rough guide.

## Behavior

- **Records exist only after `--update`.** `changelog` reads records from PR bodies, so PRs that were never updated are missing from the notes.
- **The compare API returns at most 250 commits.** Larger ranges are truncated.
- **`polish` is not applied.** The `polish` option exists in the changelog code and does nothing.
- **The regenerate checkbox does nothing yet.** It records that a person wants a new description, but nothing acts on it. Delete the block to regenerate.
- **Forks are skipped.** There is no `pull_request_target` support.
- **Not published to npm.** Build from source.

## Config

- Objects such as `scopes` in the config file replace the defaults. They are not merged.
- Unknown keys are errors. Keys from earlier versions (`tone`, `max_diff_lines`, `api_key_env`) must be removed.
