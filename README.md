# agentbase

Shared AI agent skills (plus Claude Code subagents/commands) for every repo in the org, in one place.

## Why

Each repo used to carry its own copy of the shared skills, symlinked into `.claude/`, `.cursor/`, `.agents/`… Every change meant editing N repos and opening N PRs by hand. Now you change it here, tag a release, and a PR lands in every consumer.

## How it works

- `skills/` is pulled into consumers by [rulesync](https://github.com/dyoshikawa/rulesync) (`sources` in `rulesync.jsonc`, pinned by `rulesync.lock`) and written to `.claude/skills/` (Claude Code) and `.agents/skills/` (Cursor, Codex, Antigravity all read it natively). Two copies per skill; Claude Code reads nothing but `.claude/`.
- Skills only. rulesync never touches `AGENTS.md` / `CLAUDE.md`; each repo keeps writing its own.
- `.rulesync/subagents/` and `.rulesync/commands/` are Claude-only; they ship as a plugin (`plugins/agentbase/`) from this repo's marketplace.
- A tag `vX.Y.Z` triggers `sync.yml`: every repo with the `agentbase-consumer` topic gets a `chore/agentbase-sync` PR that bumps the ref and regenerates the files.
- Consumer CI (`agentbase-check.yml`) regenerates from the lockfile and fails on drift, so generated files can't be hand-edited.

Generated files are committed in consumers on purpose: cloud/background agents and fresh clones need them without running anything. Only the fetched `.rulesync/skills/.curated/` tree is gitignored.

## Adopt in a repo

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/sulhadin/agentbase/main/scripts/adopt.sh) sulhadin \
  [--targets claudecode,codexcli] [--features skills]
```

Defaults shown. Any rulesync target or feature is accepted (`npx rulesync generate --help`); a repo can also edit `targets`/`features` in its `rulesync.jsonc` later. With `rules` enabled and several targets writing `AGENTS.md`, the last one wins — keep `codexcli` last.

Imports the repo's existing skills into `.rulesync/skills/`, writes `rulesync.jsonc` pinned to the latest release, adds the gitignore entry, `.claude/settings.json` (marketplace), the drift-check workflow, removes skill-dir symlinks, runs install + generate, adds the topic. Then delete from `.rulesync/skills/` what agentbase already ships, add `templates/codeowners-snippet` to `CODEOWNERS`, commit everything.

Repo-specific skills live in `.rulesync/skills/`; a same-named local skill overrides the shared one.

## Change shared content

1. Edit `skills/*/SKILL.md`, `.rulesync/subagents/*.md` or `.rulesync/commands/*.md`; run `npm run plugin` if you touched the last two.
2. Add a `CHANGELOG.md` entry, merge, tag `vX.Y.Z`, push the tag.

Don't set `targets` on subagents/commands or they drop out of the plugin.

## Setup (once)

- GitHub App with `contents: write`, `pull_requests: write`, `metadata: read` installed on the org; secrets `AGENTBASE_APP_ID`, `AGENTBASE_APP_PRIVATE_KEY` here.
- If this repo is private: `AGENTBASE_READ_TOKEN` in consumers' CI, and `export GITHUB_TOKEN=$(gh auth token)` for developers.
- Team `@sulhadin/platform` for CODEOWNERS.
