# Developing agentspread

This repo is the engine, published to npm as `agentspread`.

| Path | What it is |
|---|---|
| `bin/agentspread.mjs` | the CLI |
| `scripts/` | `init`, `setup` (the prompts behind `onboard` and `reconfigure`), `onboard`, `reconfigure`, `adopt`, `lint-groups`, `sync-consumer` (the apply logic sync and adopt share), and `check-pack` (CI check of what `npm pack` ships) |
| `.github/workflows/release.yml`, `sync.yml`, `check.yml` | the reusable workflows content repos call; they check out this repo at their own commit (`job.workflow_sha`), so scripts and workflows are always one version |
| `release.content.cjs` | semantic-release config for content repos |
| `templates/content/` | what `init` writes |
| `templates/consumer/` | what `adopt` writes |

`npm test` runs the suite. CI also lints `templates/content/` and checks what `npm pack` ships.

## Releasing

PR titles are conventional commits and PRs are squash-merged. To release, run the **publish** workflow from the Actions tab. It computes the version, publishes to npm through [trusted publishing](https://docs.npmjs.com/trusted-publishers) (no npm token), tags and creates the GitHub release that content repos pin. Dependabot in each content repo then opens the upgrade PRs.
