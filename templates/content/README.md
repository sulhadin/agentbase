# __NAME__

This repo holds the AI agent skills, subagents, commands and hooks shared across __OWNER__'s repos. [agentbase](https://github.com/__ENGINE__) rolls them out: every release opens a PR in each consumer repo with exactly its groups.

## Change something

Content lives in `groups/<group>/`: `skills/<name>/SKILL.md`, `subagents/<name>.md`, `commands/<name>.md`, `hooks.json` and `scripts/`. `common` reaches every consumer; a group named after a repo reaches only that repo; other groups are picked per repo.

Open a PR with a conventional title (`feat(groups): add api-design`, `fix: ...`) and squash-merge it. `docs:`, `chore:` and friends don't release.

## Release

*Actions → release → Run workflow*. The version comes from the commits since the last tag; every consumer whose content changed gets a PR.

## Onboard or reconfigure consumer repos

```bash
npm install
npm run setup
```

## Update agentbase

Dependabot opens a PR when a new agentbase version is out. It updates the `uses:` lines and `package.json` together; merge it like any other PR.
