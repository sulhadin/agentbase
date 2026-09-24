# Consumer repos

A consumer repo is any repo that receives the content repo's groups. It is onboarded once with `npm run setup` in the content repo; after that, every content release reaches it as a PR.

## Agents

`setup` asks which agents each repo uses; `--targets` takes the same values.

| Agent | `--targets` value | Writes |
|---|---|---|
| Claude Code | `claudecode` | `.claude/skills/`, `.claude/agents/`, `.claude/commands/`, hooks in `.claude/settings.json` |
| Codex, Cursor, Antigravity, GitHub Copilot, OpenCode | `codexcli` (one shared copy) | `.agents/skills/`, plus `.codex/agents/` and `.codex/hooks.json` for Codex |
| Cline, Roo Code, Kiro, Junie, Warp, Qwen Code, Augment | `cline`, `roo`, `kiro`, `junie`, `warp`, `qwencode`, `augmentcode` | `.<tool>/skills/` |

Cursor, Copilot and OpenCode also read `.claude/skills/`, so they may list a skill twice; that is harmless.

## What the adoption PR adds

`npm run setup` (or `npx agentspread onboard`) clones each repo, runs [`adopt.sh`](../scripts/adopt.sh) on branch `chore/adopt-agentspread` and opens a PR. Repos already adopted, or with an open adoption PR, are skipped. The PR adds:

- `agentspread.json`: the pinned release and the repo's groups,
- `.agentspread/`: those groups' content at that release,
- `rulesync.jsonc`: the chosen agents, reading `.agentspread/` and `.rulesync/`,
- the generated agent files from the table above,
- `.github/workflows/agentspread-check.yml`: regenerates everything and fails if the committed files differ.

It also adds the `agentspread-consumer` topic, which is how releases find the repo.

To adopt a single repo by hand, run `npx agentspread adopt <org>/agentspread-config` from its root. It writes the files and prints a checklist; committing and opening the PR is up to you.

### Before merging it

- **Existing skills, subagents or commands** are imported into `.rulesync/`, where they stay the repo's own. Delete any that the content repo now ships under the same name, then run `npx rulesync@16 generate --delete`.
- **Existing hooks** in `.claude/settings.json` or `.rulesync/hooks.json` stop adopt when a group ships hooks, since generation would replace them. Move them into the content repo's group named after the repo and re-run.
- **`.gitignore`** must not hide generated folders, or their files are never committed. Adopt and the check both fail and list the hidden files. A bare `.claude` line is the usual culprit; replace it with:
  ```gitignore
  .claude/*
  !.claude/skills/
  !.claude/agents/
  !.claude/commands/
  !.claude/settings.json
  ```

## Living with it

- `.agentspread/` and the generated folders are agentspread's; never hand-edit them. The check rejects edits to generated files, and the next sync overwrites `.agentspread/`.
- `.rulesync/` is the repo's own and wins on a name clash, so a local skill overrides a shared one with the same name. A skill an agent writes for this repo belongs there.
- `AGENTS.md` and `CLAUDE.md` stay yours; agentspread never touches them.
- Don't run `rulesync gitignore`; it would ignore the files that are committed on purpose.
- To change the repo's groups or agents, reconfigure it from the content repo (see [the README](../README.md#day-to-day)). Editing `groups` in `agentspread.json` by hand also works; the next release applies it.
