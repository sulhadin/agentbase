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
 skills/<group>/*/SKILL.md ─ release ─▶ PR "chore(agentbase): update shared AI agent skills to v1.2.0"
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

Then make it yours:
- `.claude-plugin/marketplace.json`: change `"owner": { "name": "your-org" }` to your org.
- `README.md`: in the first two badge links, replace `sulhadin/agentbase` with `<org>/agentbase`.

Nothing in the repo lists consumer repos. Sync finds them at run time as the repos under the copy's owner with the `agentbase-consumer` topic, so a copy never reaches the original owner's repos.

### 2. Put your content in

| Put | In | Reaches |
|---|---|---|
| Skills | `skills/<group>/<name>/SKILL.md` (frontmatter `name` + `description`) | every tool |
| Subagents | `.rulesync/subagents/<name>.md` | Claude Code |
| Slash commands | `.rulesync/commands/<name>.md` | Claude Code |

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

**Groups.** Every skill lives in a group folder, and each consumer repo gets only its groups:

```
skills/common/     every repo
skills/backend/    repos you put in the backend group
skills/web/        repos you put in the web group
skills/api/        the repo named api, automatically
```

- `common` is required and reaches every consumer.
- Other groups are picked per repo when onboarding (step 5); a repo can be in several.
- A group named exactly like a repo is attached to that repo automatically, also when you create it after the repo was onboarded: use it for skills that belong to one repo only. So don't name a category group after a repo.
- Skill names must be unique across groups, since a repo in two groups would otherwise get only one of them (CI checks this).

The template ships one placeholder of each kind: `skills/common/example-skill/`, `.rulesync/subagents/example-subagent.md` and `.rulesync/commands/example-command.md`. Replace them with yours.

Subagents and commands are packaged into a Claude Code plugin: after touching `.rulesync/`, run `npm install && npm run plugin` and commit the regenerated `plugins/` folder (CI fails if it is stale).

### 3. Create the GitHub App that opens the PRs

The workflows' built-in `GITHUB_TOKEN` can only touch `agentbase` itself; this App is the bot identity that opens PRs in the other repos.

1. **Create it.** Org: *Org settings → Developer settings → GitHub Apps → New GitHub App*. Personal account: *Settings → Developer settings → GitHub Apps → New GitHub App*.
   - **GitHub App name:** anything unique on GitHub, e.g. `<org>-agentbase`. It is the bot's display name and can be renamed later.
   - **Homepage URL:** required; `https://github.com/<org>/agentbase` is fine.
   - **Webhook:** untick *Active*.
   - **Repository permissions:** *Contents* → Read and write, *Pull requests* → Read and write. *Metadata* → Read-only is added automatically.
   - **Where can this GitHub App be installed?** *Only on this account*.
   - Click **Create GitHub App**.
2. **Copy the App ID.** It is on the App's *General* page under *About*, a number like `1234567`. Not the *Client ID* (`Iv23li…`).
3. **Generate a private key.** Same page, bottom, *Private keys → Generate a private key*; a `.pem` file downloads.
4. **Store both as secrets** of `<org>/agentbase`, then delete the `.pem`:
   ```bash
   gh secret set AGENTBASE_APP_ID --repo <org>/agentbase --body 1234567
   gh secret set AGENTBASE_APP_PRIVATE_KEY --repo <org>/agentbase < path/to/the-downloaded.private-key.pem
   ```
5. **Install it.** Creating the App does not install it. On the App's page choose *Install App* in the left menu → *Install* next to your org → pick *All repositories*, or *Only select repositories* including `agentbase` and every repo that will consume it. Skipping this makes every workflow run fail with `Not Found … get-a-user-installation`.
6. If `main` has a branch protection rule or ruleset (*Settings → Rules* / *Branches*), add the App to its bypass list; it pushes the release commit and tag.

> [!NOTE]
> Private `agentbase`? Consumers also need a read-only token as the `AGENTBASE_READ_TOKEN` secret for their CI, and developers need `export GITHUB_TOKEN=$(gh auth token)` before running rulesync.

### 4. Cut the first release

Consumers pin a release, so one must exist before step 5. Versions come from [conventional commits](https://www.conventionalcommits.org) on `main`; the template's `Initial commit` doesn't count.

1. **Squash merges must carry the PR title.** In *Settings → General → Pull Requests*, keep *Allow squash merging* on and set its default message to *Pull request title and description* (or *… and commit details*), or:
   ```bash
   gh api -X PATCH repos/<org>/agentbase -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=PR_BODY
   ```
2. **Optional, start at `0.x`** instead of `v1.0.0`: tag the template's first commit.
   ```bash
   git tag v0.1.0 "$(git rev-list --max-parents=0 HEAD)" && git push origin v0.1.0
   ```
3. **Commit your step 1–2 changes with a `feat` message** (directly or as a squash-merged PR), e.g. `feat(skills): add initial skills`.
4. **Release:** *Actions → release → Run workflow*, or `gh workflow run release.yml --repo <org>/agentbase`. When it finishes, *Releases* shows `v0.2.0` (or `v1.0.0`). If the run says *nothing to release*, step 3's commit was not `feat`/`fix`.

### 5. Onboard consumer repos

First give the GitHub App access to them (*Settings → Applications → your App → Configure → Repository access*). Then, from your `agentbase` clone:

```bash
npm install
npm run setup
```

Pick the repos, the agents and the skill groups, confirm. Only pick agents your team uses: every one adds a committed copy of each skill. Repos that need different groups (backend vs web) are onboarded in separate runs.

| Agent | `--targets` value | Folder |
|---|---|---|
| Claude Code | `claudecode` | `.claude/skills/` |
| Codex, Cursor, Antigravity | `codexcli` (one shared copy) | `.agents/skills/` |
| GitHub Copilot | `copilot` | `.github/skills/` |
| OpenCode, Cline, Roo Code, Kiro, Junie, Warp, Qwen Code, Augment | `opencode`, `cline`, `roo`, `kiro`, `junie`, `warp`, `qwencode`, `augmentcode` | `.<tool>/skills/` |

Non-interactive: `npm run onboard -- web api --targets claudecode,codexcli --groups backend`. Repos are names under the agentbase owner, or `owner/name`.

For each repo it clones, runs [`adopt.sh`](scripts/adopt.sh) on a `chore/adopt-agentbase` branch and opens a PR. Repos already adopted, or with an open adoption PR, are skipped. The PR adds:

- `rulesync.jsonc` (agentbase version, chosen agents, one source line per group) and `rulesync.lock` (exact content hashes),
- the generated skill folders from the table above,
- `.github/workflows/agentbase-check.yml`, which fails if the generated files drift from what the lock produces (e.g. someone hand-edited them),
- `.claude/settings.json` enabling the agentbase Claude Code plugin, pinned to the same release (sync bumps it together with `rulesync.jsonc`).

It also adds the `agentbase-consumer` topic to the repo; that topic is how releases find it, so don't add it by hand.

If the repo already had its own skills, `adopt.sh` imports them into `.rulesync/skills/`. Before merging, delete from there any that agentbase now ships (same name) and run `npx rulesync@16 generate`; if the folder is empty, there is nothing to do.

`onboard` also takes `--features skills,rules` (any rulesync value works). To adopt by hand instead, run `bash <(curl -fsSL https://raw.githubusercontent.com/<org>/agentbase/main/scripts/adopt.sh) <org>` from the repo root.

> [!WARNING]
> If a consumer's `.gitignore` ignores a generated folder, that agent's skills are silently never committed and the drift check cannot notice. A bare `.claude` line is the usual culprit. In the repo, run `git check-ignore -v .claude/skills .claude/settings.json .agents/skills`; no output means fine. Otherwise replace the matching line, e.g. `.claude` with:
> ```gitignore
> .claude/*
> !.claude/skills/
> !.claude/settings.json
> ```

**Check it works.** After merging the adoption PRs, roll the latest release out by hand:

```bash
gh workflow run sync.yml --repo <org>/agentbase -f ref=$(gh release view --repo <org>/agentbase --json tagName -q .tagName)
```

The *sync consumers* run should list your repos under `rollout`. A repo whose adoption PR is not merged yet is skipped with a notice. Once a release actually changes a skill, each consumer gets a `chore(agentbase): update shared AI agent skills to vX.Y.Z` PR listing the changed skills.

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
| [`sync.yml`](.github/workflows/sync.yml) | PR `chore/agentbase-sync` in every repo with topic `agentbase-consumer` whose skills changed; the PR lists them. Repos whose groups were untouched get no PR. |
| consumer CI | [`agentbase-check.yml`](templates/consumer-ci.yml) regenerates from `rulesync.lock` and fails on drift |

**Release from another branch:** set the Actions variable `RELEASE_BRANCH` (*Settings → Secrets and variables → Actions → Variables*) to release that branch instead of `main`, e.g. to keep `main` as a clean template while your own content lives elsewhere. The release workflow then refuses to run from any other branch.

**Roll out to one repo only:** *Actions → sync consumers → Run workflow*, set `ref` to a tag (e.g. `v1.2.0`) and `repo` to the repo name (e.g. `web`).

**In a consumer repo:**
- A local skill in `.rulesync/skills/` with the same name overrides the shared one.
- To change a repo's groups, add or remove whole `sources` lines in its `rulesync.jsonc` (copy the `common` line and change the path), then run `npx rulesync@16 install --update && npx rulesync@16 generate`.
- Never hand-edit generated files; CI rejects it and the next sync overwrites it.
- `AGENTS.md` / `CLAUDE.md` stay yours; skills-only mode never touches them.

## Gotchas

- Don't run `rulesync gitignore` in consumers; it would ignore the files that are committed on purpose.
- Don't set `targets` in subagent/command frontmatter; the plugin target gets filtered out.
- With `rules` enabled, several targets write `AGENTS.md` and the last wins; keep `codexcli` last.
- A personal account can't approve its own PRs, so "Require review from Code Owners" blocks your own edits to `rulesync.jsonc`.
