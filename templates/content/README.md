# __NAME__

This repo holds the AI agent skills, subagents, commands and hooks shared across __OWNER__'s repos. [agentspread](https://github.com/__ENGINE__) rolls them out: every release opens a PR in each consumer repo with exactly its groups.

## Change something

Content lives in `groups/<group>/`: `skills/<name>/SKILL.md`, `subagents/<name>.md`, `commands/<name>.md`, `hooks.json` and `scripts/`. `common` reaches every consumer; a group named after a repo reaches only that repo; other groups are picked per repo.

Open a PR with a conventional title (`feat(groups): add api-design`, `fix: ...`) and squash-merge it. `docs:`, `chore:` and friends don't release.

## Release

Open the **Actions** tab, pick the **release** workflow and click **Run workflow**. The version comes from the commits since the last tag, and every consumer repo whose content changed gets a PR.

## Add consumer repos

```bash
npm install
npm run onboard
```

Pick the repos, the agents they use and their groups. Each repo gets an adoption PR.

## Change a repo's groups or agents

```bash
npm run reconfigure
```

Pick the repo, then adjust its agents and groups. The repo gets a PR.

## Update agentspread

Dependabot opens two PRs when a new agentspread version is out: one for the `uses:` pins in `.github/workflows/`, one for `package.json`. Merge both so the workflows and the CLI stay on one version.
