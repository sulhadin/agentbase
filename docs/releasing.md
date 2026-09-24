# Releasing

Consumer repos only change when the content repo cuts a release. Each release gets a version tag, and every consumer repo whose content changed gets a PR.

## How the version is chosen

The version comes from the [conventional commit](https://www.conventionalcommits.org) messages on `main` since the last tag. PRs are squash-merged, so the PR title becomes the commit message.

| PR title | Release |
|---|---|
| `feat(groups): add api-design` | minor |
| `fix: ...`, `perf: ...` | patch |
| `feat!: ...` or `BREAKING CHANGE:` in the body | major |
| `docs:`, `chore:`, `refactor:`, `ci:`, ... | none |

Changing what an agent is told or runs is `feat` or `fix`, not `docs`. The check workflow rejects PR titles that aren't conventional commits.

## Before the first release

1. Make squash merges use the PR title:
   ```bash
   gh api -X PATCH repos/<org>/agentspread-config -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=PR_BODY
   ```
2. Optional: to start at `0.x` instead of `v1.0.0`, tag the first commit:
   ```bash
   git tag v0.1.0 "$(git rev-list --max-parents=0 HEAD)" && git push origin v0.1.0
   ```
3. Commit your content with a `feat` message, e.g. `feat(groups): add initial skills`, and push it to `main`.

## Cut a release

1. In the content repo on GitHub, open the **Actions** tab.
2. Pick the **release** workflow on the left and click **Run workflow** (branch `main`).

Or from a terminal: `gh workflow run agentspread-release.yml --repo <org>/agentspread-config`.

The workflow:

1. computes the next version from the commits since the last tag,
2. updates `CHANGELOG.md`, tags the release and publishes it under **Releases**,
3. opens or updates a `chore/agentspread-sync` PR in every consumer repo whose content changed.

If there was no `feat`, `fix`, `perf` or breaking commit since the last tag, it stops with a *nothing to release* notice.

## Releasing from a branch other than `main`

1. In the content repo, open **Settings**, then **Secrets and variables**, then **Actions**.
2. On the **Variables** tab, add a variable `RELEASE_BRANCH` with the branch name.
3. Point the `release` environment's deployment branch at the same branch ([The GitHub App, step 3](github-app.md#3-store-them-in-a-release-environment)).

The release workflow then refuses to run from any other branch.
