<h1 align="center">agentbase</h1>

<p align="center">
  <a href="https://github.com/sulhadin/agentbase/actions/workflows/ci.yml"><img alt="ci" src="https://github.com/sulhadin/agentbase/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/sulhadin/agentbase/releases"><img alt="release" src="https://img.shields.io/github/v/release/sulhadin/agentbase?include_prereleases"></a>
  <a href="https://github.com/dyoshikawa/rulesync"><img alt="powered by rulesync" src="https://img.shields.io/badge/powered%20by-rulesync-blue"></a>
</p>

<p align="center">
<b>Write your AI agent skills once. Every repo gets them as a PR.</b><br>
Claude Code · Cursor · Codex · Antigravity
</p>

---

Teams copy the same `SKILL.md` files into every repo, and the copies drift. agentbase keeps them in **one repo**. Merge conventional-commit PRs, press *Run workflow*, and each consumer repo gets a pull request with the new version, generated for every AI tool it uses. Versions, tags and `CHANGELOG.md` are computed for you.

```
 your-org/agentbase                   each consumer repo
 ──────────────────                   ──────────────────
 skills/*/SKILL.md ── release v1.2.0 ──▶ PR "Bump agentbase to v1.2.0"
                                          ├─ .claude/skills/   → Claude Code
                                          └─ .agents/skills/   → Cursor · Codex · Antigravity
 .rulesync/subagents, commands ─────────▶ Claude Code plugin (marketplace)
```

It is not an npm package. Consumers pin a git tag of this repo, and [rulesync](https://github.com/dyoshikawa/rulesync) fetches and converts it. Generated files are committed, so every clone and cloud agent sees them without a build step.

## Set it up for your org

You need: `gh` (logged in), Node 22+, and admin rights on the org.

### 1. Create your copy

```bash
gh repo create <org>/agentbase --template sulhadin/agentbase --public --clone
```

Keep the name **`agentbase`**; the scripts and workflows address `<org>/agentbase`.

### 2. Put your content in

| Put | In | Reaches |
|---|---|---|
| Skills | `skills/<name>/SKILL.md` (frontmatter `name` + `description`) | every tool |
| Subagents | `.rulesync/subagents/<name>.md` | Claude Code |
| Slash commands | `.rulesync/commands/<name>.md` | Claude Code |

Replace the example skills. After touching `.rulesync/`, run `npm install && npm run plugin` and commit `plugins/`; CI fails if it is stale.

In `templates/codeowners-snippet`, keep `@__ORG__` for a personal account; for an org, use a team, e.g. `@__ORG__/platform`.

### 3. Create the GitHub App that opens the PRs

1. **Settings → Developer settings → GitHub Apps → New.** No webhook. Permissions: *Contents* read & write, *Pull requests* read & write, *Metadata* read.
2. Install it on the org, on `agentbase` plus every repo that will consume it (or all repos).
3. Generate a private key, then in `<org>/agentbase`:
   ```bash
   gh secret set AGENTBASE_APP_ID --body <app-id>
   gh secret set AGENTBASE_APP_PRIVATE_KEY < key.pem
   ```
4. If `main` is protected, add the App to the bypass list; it pushes the release commit and tag.

> [!NOTE]
> Private `agentbase`? Consumers also need a read-only token as the `AGENTBASE_READ_TOKEN` secret for their CI, and developers need `export GITHUB_TOKEN=$(gh auth token)` before running rulesync.

### 4. Make squash merges carry the PR title

Releases are computed from the commits on `main`, so each squash commit must be the (conventional) PR title:

```bash
gh api -X PATCH repos/<org>/agentbase -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=PR_BODY
```

The first release is `v1.0.0`. To start at `0.x`, push a baseline tag first: `git tag v0.1.0 && git push origin v0.1.0`.

### 5. Onboard consumer repos

First give the GitHub App access to them (*Settings → Applications → your App → Configure → Repository access*). Then, from your `agentbase` clone:

```bash
npm run onboard -- repo-a repo-b
```

For each repo it clones, runs [`adopt.sh`](scripts/adopt.sh) on a `chore/adopt-agentbase` branch and opens a PR. `adopt.sh` pins the latest release, imports skills the repo already has, generates the tool folders, adds a drift-check workflow and the Claude plugin, and tags the repo `agentbase-consumer`. Repos already adopted, or with an open adoption PR, are skipped.

Before merging each PR, delete from `.rulesync/skills/` anything agentbase now ships and re-run `npx rulesync@16 generate`.

Other tools or features: `--targets cursor,claudecode --features skills,rules` (any rulesync value works). To adopt by hand instead, run `bash <(curl -fsSL https://raw.githubusercontent.com/<org>/agentbase/main/scripts/adopt.sh) <org>` from the repo root.

That's it. From now on, every release opens a PR in every consumer repo.

## Day to day

**Change a skill:** open a PR with a conventional title, squash-merge it. Repeat as often as you like.

| PR title | Release |
|---|---|
| `feat(skills): add api-design` | minor |
| `fix: ...`, `perf: ...` | patch |
| `feat!: ...` or `BREAKING CHANGE:` in the body | major |
| `docs:`, `chore:`, `refactor:`, `ci:`, ... | none |

[`pr-title.yml`](.github/workflows/pr-title.yml) rejects anything else. Changing what a skill tells the agent is `feat` or `fix`, not `docs`.

**Release:** *Actions → release → Run workflow* (or `gh workflow run release`).

| Step | What happens |
|---|---|
| [`release.yml`](.github/workflows/release.yml) | next version from the commits since the last tag; updates `CHANGELOG.md` and the plugin version, tags, publishes the GitHub release. No-op if nothing releasable. |
| [`sync.yml`](.github/workflows/sync.yml) | PR `chore/agentbase-sync` in every repo with topic `agentbase-consumer` |
| consumer CI | [`agentbase-check.yml`](templates/consumer-ci.yml) regenerates from `rulesync.lock` and fails on drift |

**Roll out to one repo only:** *Actions → sync consumers → Run workflow*, set `repo`.

**In a consumer repo:**
- A local skill in `.rulesync/skills/` with the same name overrides the shared one.
- Never hand-edit generated files; CI rejects it and the next sync overwrites it.
- `AGENTS.md` / `CLAUDE.md` stay yours; skills-only mode never touches them.

## Gotchas

- Don't run `rulesync gitignore` in consumers; it would ignore the files that are committed on purpose.
- Don't set `targets` in subagent/command frontmatter; the plugin target gets filtered out.
- With `rules` enabled, several targets write `AGENTS.md` and the last wins; keep `codexcli` last.
- A personal account can't approve its own PRs, so "Require review from Code Owners" blocks your own edits to `rulesync.jsonc`.
