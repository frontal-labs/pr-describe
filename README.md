# @frontal-labs/pr-describe

Drafts PR descriptions and change records from a diff. The model runs in-process with [ggml-node](https://www.npmjs.com/package/ggml-node): no API key, no hosted backend, no telemetry.

**Status:** not published to npm yet. `describe` prints a description and, with `--update`, replaces the PR body (opt-in). `changelog` builds release notes from the PR records between two refs. See [docs/README.md](docs/README.md) for the full reference.

## Quickstart

```sh
git clone <this repo> pr-describe && cd pr-describe
bun install && bun run build

cd /path/to/your/repo
node /path/to/pr-describe/dist/cli.js init
export GITHUB_TOKEN=...              # read access to pull requests
export GITHUB_REPOSITORY=owner/repo
node /path/to/pr-describe/dist/cli.js describe --pr 42 --dry-run
```

`init` writes `.describerc.json`. The first run downloads the model (about 1.1 GB for the default).

## Commands

```sh
pr-describe describe --pr 42                 # print a description and change record for a PR
pr-describe describe --pr 42 --dry-run       # do not print the new PR body
pr-describe describe --pr 42 --write-file    # also write .changes/42.json
pr-describe describe --pr 42 --update        # replace the PR body with the generated block (needs GITHUB_TOKEN)
pr-describe changelog --from v1 --to v2 --format markdown
pr-describe init                             # write .describerc.json
```

## Documentation

- [docs/README.md](docs/README.md): landing page and map of the reference docs.
- [docs/QUICKSTART.md](docs/QUICKSTART.md): install, configure and run.
- [docs/CLI_REFERENCE.md](docs/CLI_REFERENCE.md): every command and flag.
- [docs/CONFIGURATION.md](docs/CONFIGURATION.md): `.describerc.json` keys.
- [docs/GITHUB_ACTION.md](docs/GITHUB_ACTION.md): the composite action.
- [examples/pr-describe.yml](examples/pr-describe.yml): the GitHub Actions workflow.

## License

MIT. See [LICENSE.md](LICENSE.md).
