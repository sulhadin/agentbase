# Writing groups

Everything in the content repo lives in **groups**, and each consumer repo gets only its groups:

```
groups/
  common/                    every repo
    skills/<name>/SKILL.md   used by every agent
    subagents/<name>.md      used by Claude Code and Codex
    commands/<name>.md       used by Claude Code
    hooks.json               used by Claude Code and Codex
    scripts/                 files the hooks run, found at .agentspread/scripts/common/…
    AGENTS.md                instructions added to each repo's AGENTS.md (and CLAUDE.md, if it has one)
  backend/                   repos you put in the backend group
  api/                       the repo named api, automatically
```

- `common` is required and reaches every consumer. Other groups are picked per repo when onboarding; a repo can be in several.
- A group named exactly like a repo attaches to that repo automatically, even if you create it later. Use it for things that belong to one repo only, and don't name a category group after a repo.
- `npm run group` in the content repo creates a group with placeholder files; see [the README](../README.md#add-a-group).
- A group can have any mix of the parts. Group and skill names must be lowercase kebab-case; use the same style for subagents and commands. Skill, subagent and command names must be unique across groups.

## Skills

A skill is a folder with one `SKILL.md`: YAML frontmatter, then the instructions in Markdown.

```markdown
---
name: api-design
description: REST conventions for this org. Use when adding or changing an HTTP endpoint.
---
1. Plural nouns for collections: `/users`, `/users/{id}`.
2. ...
```

`name` must match the folder name; `description` tells the agent when to load it.

## Instructions (AGENTS.md)

A group's `AGENTS.md` holds plain Markdown instructions every agent should follow, like a repo-level `AGENTS.md` you would write by hand.

In each consumer repo, the `AGENTS.md` files of its groups are joined (`common` first, the repo's own group last) and written into a section of the repo's own `AGENTS.md`. The section sits between two HTML comments, which don't show when the file is rendered:

```markdown
# The repo's own notes, untouched

<!-- agentspread:start (managed by agentspread; edits inside are overwritten on the next sync) -->
Instructions from the groups' AGENTS.md files
<!-- agentspread:end -->
```

Only the lines between the markers are agentspread's. If the repo has no `AGENTS.md`, it is created; if it has one without the markers, the section is added at the end. If the groups stop shipping instructions, the section is removed, and so is an `AGENTS.md` that held nothing else.

Claude Code reads `AGENTS.md` only when a repo has no `CLAUDE.md`. So if the repo has its own `CLAUDE.md`, the same section goes there too. `CLAUDE.md` is never created, and it is left alone when it is a symlink to `AGENTS.md` or imports it (`@AGENTS.md` anywhere in the file), since Claude then reads the section already.

## Subagents, commands and hooks

They use [rulesync's formats](https://github.com/dyoshikawa/rulesync). A hook that runs a script refers to it as `.agentspread/scripts/<group>/<file>`, and the file lives in `groups/<group>/scripts/<file>`.

Generation replaces the whole `hooks` key in a consumer's `.claude/settings.json`, so a repo's own hooks belong in the group named after that repo.

## Lint

`npm run lint` locally, and the check workflow on every PR. It fails on layout mistakes: a missing `groups/common/`, bad names, duplicates and missing hook scripts. It warns on what needs a careful review, because it runs code or skips prompts on every developer's machine: hooks, `allowed-tools`, `permissionMode`, `` !`command` `` lines and frontmatter hooks.

## Gotchas

- Don't set `targets` in subagent or command frontmatter; rulesync would skip them for the other agents.
- A skill with `disable-model-invocation: true` also needs a `codexcli:` policy section, or Codex may still invoke it. The lint warns about it.
