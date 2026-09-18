# agentbase

Shared AI agent config (rules, skills, Claude Code subagents/commands) for every repo in the org, in one place.

## Why

Each repo used to carry its own copy of the shared rules, symlinked into `.claude/`, `.cursor/`, `.gemini/`… Every change meant editing N repos and opening N PRs by hand. Now you change it here, tag a release, and a PR lands in every consumer.

## How it works

- `rules/` and `skills/` are pulled into consumers by [rulesync](https://github.com/dyoshikawa/rulesync) (`sources` in `rulesync.jsonc`, pinned by `rulesync.lock`) and rendered into `AGENTS.md` + `.agents/skills/` (read natively by Cursor, Codex and Antigravity) and `CLAUDE.md` + `.claude/` (Claude Code reads nothing else).
- `.rulesync/subagents/` and `.rulesync/commands/` are Claude-only; they ship as a plugin (`plugins/agentbase/`) from this repo's marketplace.
- A tag `vX.Y.Z` triggers `sync.yml`: every repo with the `agentbase-consumer` topic gets a `chore/agentbase-sync` PR that bumps the ref and regenerates the files.
- Consumer CI (`agentbase-check.yml`) regenerates from the lockfile and fails on drift, so generated files can't be hand-edited.

Default targets are `claudecode` and `codexcli`; that is the minimum that reaches all four tools, at two copies per rule and skill. A repo that needs glob-scoped Cursor rules adds `cursor` to its own `rulesync.jsonc`.

Generated files are committed in consumers on purpose: cloud/background agents and fresh clones need them without running anything. Only the fetched `.rulesync/**/.curated/` trees are gitignored.

## Adopt in a repo

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/sulhadin/agentbase/main/scripts/adopt.sh) sulhadin
```

Imports the repo's existing config into `.rulesync/`, writes `rulesync.jsonc` pinned to the latest release, adds the gitignore entries, `.claude/settings.json` (marketplace), the drift-check workflow, removes old symlinks, runs install + generate, adds the topic. Then delete from `.rulesync/` what agentbase already ships, add `templates/codeowners-snippet` to `CODEOWNERS`, commit everything.

Repo-specific content lives in `.rulesync/rules/` and `.rulesync/skills/`; a same-named local file overrides the shared one.

## Change shared content

1. Edit `rules/*.md`, `skills/*/SKILL.md`, `.rulesync/subagents/*.md` or `.rulesync/commands/*.md`; run `npm run plugin` if you touched the last two.
2. Add a `CHANGELOG.md` entry, merge, tag `vX.Y.Z`, push the tag.

Rules must be flat files without `root: true`. Don't set `targets` on subagents/commands or they drop out of the plugin.

## Setup (once)

- GitHub App with `contents: write`, `pull_requests: write`, `metadata: read` installed on the org; secrets `AGENTBASE_APP_ID`, `AGENTBASE_APP_PRIVATE_KEY` here.
- If this repo is private: `AGENTBASE_READ_TOKEN` in consumers' CI, and `export GITHUB_TOKEN=$(gh auth token)` for developers.
- Team `@sulhadin/platform` for CODEOWNERS.
