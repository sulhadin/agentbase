# Delivery without a key

By default a release reaches consumer repos through a [GitHub App](github-app.md): the release workflow opens a PR in every repo as soon as it runs. If you don't want to create an App and store its key, each consumer repo can pull releases itself instead.

| | GitHub App (default) | Without a key |
|---|---|---|
| What you set up | an App, its key in a `release` environment | nothing |
| When a release reaches a repo | right after the release, in every repo | when someone runs that repo's **agentspread update** workflow |
| Content repo | public or private | must be public |
| Checks on the update PR | run as usual | don't run (see below) |

Pick one per content repo; every consumer repo gets releases the same way.

## Set it up

**New content repo:** run `npx agentspread init --delivery pull`, or pick "Without an App or key" when `init` asks. Skip the GitHub App step of the [setup walkthrough](setup.md).

**Existing content repo:**

1. Upgrade agentspread to the latest version: the `agentspread` version in `package.json` and the `@v…` at the end of each `uses:` line in `.github/workflows/agentspread-*.yml`. Older versions don't know this mode.
2. Add this to its `package.json`:
   ```json
   "agentspread": { "delivery": "pull" }
   ```
3. In `.github/workflows/agentspread-release.yml`, add these lines above `jobs:`, so the release can push its commit and tag with the workflow's own token:
   ```yaml
   permissions:
     contents: write
   ```
4. Push all of it to `main`.

Then, in each repo that is already onboarded, run `npx agentspread adopt <org>/<content repo>` once from its root and commit the result; that adds the update workflow. Repos you onboard later get it automatically.

The content repo must be public: consumer repos read it with their own token, which can't see other private repos.

## Get a release into a repo

1. Cut the release in the content repo as usual ([Releasing](releasing.md)).
2. In the consumer repo on GitHub, open the **Actions** tab.
3. Pick the **agentspread update** workflow and click **Run workflow**. Leave `ref` empty for the latest release, or enter a tag.

The workflow copies that release into `.agentspread/`, regenerates the agent files and opens a `chore/agentspread-sync` PR in that repo (or updates the open one). It takes the content from that release, and runs the agentspread version the content repo's `main` pins, so upgrading agentspread there upgrades it for every consumer at once.

## What to know

- **"Allow GitHub Actions to create and approve pull requests"** must be on in each consumer repo (*Settings*, then *Actions*, then *General*). Onboarding turns it on when it can and tells you when it can't; in an organization, the org setting may have to allow it first.
- **Checks don't run on the update PR.** GitHub doesn't start workflows for PRs opened with a workflow's own token. The update workflow regenerates everything itself, so the PR is consistent; your repo's other checks run once you push to the branch or merge.
- **The content repo's release branch** must accept pushes from GitHub Actions, since the release commit and tag are pushed with the workflow's own token. A ruleset that requires PRs on `main` blocks it.
- **Nothing happens on its own.** A repo stays on its release until someone runs its update workflow.
