# Manual sync

A release rolls out to every consumer repo on its own. A manual sync rolls out a release that already exists, without cutting a new one.

This is for App delivery. With [delivery without a key](keyless-delivery.md), each repo pulls releases through its own **agentspread update** workflow instead.

Use it when:

- you onboarded repos and want to check they receive releases,
- a repo's PR failed or was closed, and you want it opened again (for example after fixing its `.gitignore`),
- a repo has to go back to an older release.

## Run it

1. In the content repo on GitHub, open the **Actions** tab.
2. Pick the **sync consumers** workflow on the left and click **Run workflow**. Keep the branch on `main`: the workflow needs the `release` environment, which only `main` can use.
3. Fill in the fields and click **Run workflow**:

| Field | What to enter |
|---|---|
| `ref` | the release tag to roll out, e.g. `v1.2.0` (listed under **Releases**) |
| `repo` | one repo name, e.g. `web`; leave empty for every consumer repo |
| `force` | tick only to move a repo back to an older release; sync refuses that otherwise |

Or from a terminal, in the content repo:

```bash
gh workflow run agentspread-sync.yml -f ref=v1.2.0 -f repo=web
```

## What happens

For each repo, sync copies its groups at that tag into `.agentspread/`, regenerates the agent files and opens a `chore/agentspread-sync` PR, or updates the one already open.

- A repo that is already on that release gets no PR.
- A repo whose adoption PR isn't merged yet is skipped with a notice in the run.
- The run lists every repo it handled under the `rollout` job.
