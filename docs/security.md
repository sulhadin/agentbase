# Security

What agentspread ships runs inside every developer's agent in every consumer: hooks and hook scripts execute commands, and a skill can pre-approve tools or run `` !`command` `` lines. Treat a merge to the content repo like a deploy.

- Require reviews on the content repo's release branch, and add `CODEOWNERS` for `groups/**/hooks.json`, `groups/**/scripts/` and `groups/**/subagents/`. The lint warnings mark what to look at.
- Keep the App key in the `release` environment and protect `v*` tags ([The GitHub App](github-app.md)).
- In consumers, append the `CODEOWNERS` lines `adopt.sh` prints, with a team as owner in an organization. A personal account can't approve its own PRs, so "Require review from Code Owners" would block your own edits there.
- Orgs that want only vetted hooks can combine this with Claude Code's managed settings, e.g. `allowManagedHooksOnly`.

What the workflows do to limit the blast radius:

- Each job gets App tokens scoped to one repo and the minimum permissions; checkouts don't keep credentials.
- rulesync runs with no token at all, and the npm registry is pinned so a consumer's `.npmrc` can't swap packages.
- Consumer CI needs no secrets: the content is committed in `.agentspread/`.
