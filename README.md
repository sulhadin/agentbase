<h1 align="center">agentbase</h1>

<p align="center">
  <a href="https://github.com/sulhadin/agentbase/actions/workflows/ci.yml"><img alt="ci" src="https://github.com/sulhadin/agentbase/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/sulhadin/agentbase/releases"><img alt="release" src="https://img.shields.io/github/v/release/sulhadin/agentbase?include_prereleases"></a>
  <a href="https://github.com/dyoshikawa/rulesync"><img alt="powered by rulesync" src="https://img.shields.io/badge/powered%20by-rulesync-blue"></a>
</p>

<p align="center">
<b>Write your AI agent skills, subagents, commands and hooks once. Every repo gets them as a PR.</b><br>
Claude Code · Codex · Cursor · Antigravity · Copilot · OpenCode · and more
</p>

---

Teams copy the same agent config into every repo, and the copies drift. agentbase keeps it in **one repo**, split into groups (org-wide, per platform, per repo). Merge conventional-commit PRs, press *Run workflow*, and each consumer repo gets a pull request with exactly its groups, generated for every AI tool it uses. Versions, tags and `CHANGELOG.md` are computed for you.

```
 your-org/agentbase                          each consumer repo
 ──────────────────                          ──────────────────
 groups/common/  ─┐                          PR "chore(agentbase): update shared AI agent config to v1.2.0"
 groups/backend/ ─┼─ release v1.2.0 ──────▶    .agentbase/        its groups, copied at v1.2.0
 groups/web/     ─┘                             .claude/           skills, agents, commands, hooks → Claude Code
                                                .agents/skills/    → Codex, Cursor, Antigravity, Copilot, OpenCode
                                                .codex/            agents, hooks → Codex
```

It is not an npm package. Sync copies the release into the consumer's committed `.agentbase/`, and [rulesync](https://github.com/dyoshikawa/rulesync) generates each tool's files from it. Everything is committed, so every clone and cloud agent session sees it without a build step or a token.

## Why agentbase over plain rulesync

rulesync does the conversion: agentbase uses it to write each agent's files. What rulesync leaves to you is getting shared content into many repos and keeping it current. That is the part agentbase adds.

| Need | rulesync alone | agentbase |
|---|---|---|
| Convert one source into every agent's format | ✅ | ✅ (through rulesync) |
| Pull shared content from a central repo | `sources` fetches **skills and rules only** | Skills, subagents, commands, hooks and the scripts hooks run |
| Ship a new version to every repo | Someone bumps `ref` in each repo by hand | A release opens a PR in every consumer repo, found by topic |
| Versions and changelog | None | Computed from conventional commits |
| Different content per repo | Each repo lists the source paths it wants by hand; a path that doesn't exist fails the install | Groups: org-wide, per platform, per repo (a group named after a repo attaches to it on its own) |
| Change a repo's selection later | Edit its config by hand | `npm run setup` → reconfigure opens a PR |
| Regenerate in CI without network or a token | `install` fetches at CI time; a private source needs a token in every repo | Content is committed in `.agentbase/`; consumer CI needs neither |
| Catch hand edits and files that never got committed | `install --frozen` checks the lockfile | CI regenerates and fails on edits, uncommitted output and `.gitignore` rules that hide it |
| Review what runs on developers' machines | No checks | Lint flags hooks, `allowed-tools`, `` !`command` `` lines and frontmatter hooks |
| Roll out safely | — | No silent downgrades, one rollout per repo at a time, scoped App tokens, release key limited to one branch |

If you only share skills across a handful of repos and don't mind bumping a ref in each, rulesync's `sources` alone is enough.

## Set it up for your org

You need: `gh` (logged in), Node 22+, and admin rights on the org.

### 1. Create your copy

```bash
gh repo create <org>/agentbase --template sulhadin/agentbase --private --clone
```

Keep the name **`agentbase`**; the scripts and workflows address `<org>/agentbase`. Private is the safer default: the repo holds your agents' prompts and hooks. Consumers need no token either way.

Then, in `README.md`, replace `sulhadin/agentbase` with `<org>/agentbase` in the first two badge links.

Nothing in the repo lists consumer repos. Sync finds them at run time as the repos under the copy's owner with the `agentbase-consumer` topic, so a copy never reaches the original owner's repos.

### 2. Put your content in

Everything lives in **groups**, and each consumer repo gets only its groups:

```
groups/
  common/                    every repo
    skills/<name>/SKILL.md   → every agent
    subagents/<name>.md      → Claude Code, Codex
    commands/<name>.md       → Claude Code
    hooks.json               → Claude Code, Codex
    scripts/                 → files hooks run, as .agentbase/scripts/common/…
  backend/                   repos you put in the backend group
  web/                       repos you put in the web group
  api/                       the repo named api, automatically
```

- `common` is required and reaches every consumer. Other groups are picked per repo when onboarding (step 5); a repo can be in several.
- A group named exactly like a repo attaches to that repo automatically, also when you create it after the repo was onboarded: use it for things that belong to one repo only. So don't name a category group after a repo.
- A group can have any mix of the parts. Group, skill, subagent and command names are lowercase kebab-case and must be unique across groups, since a repo in two groups would otherwise get only one of them.
- `npm test` and `node scripts/lint-groups.mjs` run in CI. The lint fails on layout mistakes and warns on what needs a careful review: hooks, `allowed-tools`, `` !`command` `` lines and frontmatter hooks, because they run code or skip prompts on every developer's machine in every consumer.

A skill is a folder with one `SKILL.md`: YAML frontmatter, then the instructions in Markdown.

```markdown
---
name: api-design
description: REST conventions for this org. Use when adding or changing an HTTP endpoint.
---
1. Plural nouns for collections: `/users`, `/users/{id}`.
2. ...
```

`name` must match the folder name; `description` tells the agent when to load it. Subagents, commands and `hooks.json` use [rulesync's formats](https://github.com/dyoshikawa/rulesync). A hook that runs a script refers to it as `.agentbase/scripts/<group>/<file>`, and the file lives in `groups/<group>/scripts/<file>`; CI checks that it exists.

The template ships one placeholder skill, subagent and command in `groups/common/`. Replace them with yours.

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
4. **Create a `release` environment** in `<org>/agentbase` (*Settings → Environments → New environment*). Under *Deployment branches*, choose *Selected branches* and add your release branch (`main`, or the `RELEASE_BRANCH` below). Then store both values as **environment** secrets and delete the `.pem`:
   ```bash
   gh secret set AGENTBASE_APP_ID --repo <org>/agentbase --env release --body 1234567
   gh secret set AGENTBASE_APP_PRIVATE_KEY --repo <org>/agentbase --env release < path/to/the-downloaded.private-key.pem
   ```
   The App can push to agentbase and open PRs everywhere; keeping its key in an environment limited to the release branch stops any other branch from using it.
5. **Install it.** Creating the App does not install it. On the App's page choose *Install App* in the left menu → *Install* next to your org → pick *All repositories*, or *Only select repositories* including `agentbase` and every repo that will consume it. Skipping this makes every workflow run fail with `Not Found … get-a-user-installation`.
6. If the release branch has a branch protection rule or ruleset (*Settings → Rules* / *Branches*), add the App to its bypass list; it pushes the release commit and tag. Protect `v*` tags with a ruleset too, since consumers roll out whatever a tag points to.

### 4. Cut the first release

Consumers pin a release, so one must exist before step 5. Versions come from [conventional commits](https://www.conventionalcommits.org) on the release branch; the template's `Initial commit` doesn't count.

1. **Squash merges must carry the PR title.** In *Settings → General → Pull Requests*, keep *Allow squash merging* on and set its default message to *Pull request title and description* (or *… and commit details*), or:
   ```bash
   gh api -X PATCH repos/<org>/agentbase -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=PR_BODY
   ```
2. **Optional, start at `0.x`** instead of `v1.0.0`: tag the template's first commit.
   ```bash
   git tag v0.1.0 "$(git rev-list --max-parents=0 HEAD)" && git push origin v0.1.0
   ```
3. **Commit your step 1–2 changes with a `feat` message** (directly or as a squash-merged PR), e.g. `feat(groups): add initial skills`.
4. **Release:** *Actions → release → Run workflow*, or `gh workflow run release.yml --repo <org>/agentbase`. When it finishes, *Releases* shows `v0.2.0` (or `v1.0.0`). If the run says *nothing to release*, step 3's commit was not `feat`/`fix`.

### 5. Onboard consumer repos

First give the GitHub App access to them (*Settings → Applications → your App → Configure → Repository access*). Then, from your `agentbase` clone:

```bash
npm install
npm run setup
```

Pick the repos, the agents and the groups, confirm. Repos that need different groups (backend vs web) are onboarded in separate runs.

| Agent | `--targets` value | Writes |
|---|---|---|
| Claude Code | `claudecode` | `.claude/skills/`, `.claude/agents/`, `.claude/commands/`, hooks in `.claude/settings.json` |
| Codex, Cursor, Antigravity, GitHub Copilot, OpenCode | `codexcli` (one shared copy) | `.agents/skills/`, plus `.codex/agents/` and `.codex/hooks.json` for Codex |
| Cline, Roo Code, Kiro, Junie, Warp, Qwen Code, Augment | `cline`, `roo`, `kiro`, `junie`, `warp`, `qwencode`, `augmentcode` | `.<tool>/skills/` |

Cursor, Copilot and OpenCode also read `.claude/skills/`, so they may list a skill twice; that is harmless.

Non-interactive: `npm run onboard -- web api --targets claudecode,codexcli --groups backend`. Repos are names under the agentbase owner, or `owner/name`.

For each repo it clones, runs [`adopt.sh`](scripts/adopt.sh) on a `chore/adopt-agentbase` branch and opens a PR. Repos already adopted, or with an open adoption PR, are skipped. The PR adds:

- `agentbase.json`: the pinned release and the repo's groups,
- `.agentbase/`: those groups' content at that release; never edited by hand,
- `rulesync.jsonc`: the chosen agents, and `.agentbase/` plus `.rulesync/` as its inputs,
- the generated agent files from the table above,
- `.github/workflows/agentbase-check.yml`, which regenerates everything and fails if the committed files differ (e.g. someone hand-edited them).

It also adds the `agentbase-consumer` topic to the repo; that topic is how releases find it, so don't add it by hand.

If the repo already had its own skills, subagents or commands, `adopt.sh` imports them into `.rulesync/`, where they stay the repo's own. Before merging, delete from there any that agentbase now ships (same name) and run `npx rulesync@16 generate --delete`.

If the repo already has hooks in `.claude/settings.json` and one of its groups ships hooks, adopt stops: generation would replace them. Move them into the agentbase group named after the repo, then re-run.

To adopt by hand instead, run `bash <(curl -fsSL https://raw.githubusercontent.com/<org>/agentbase/main/scripts/adopt.sh) <org>` from the repo root.

> [!WARNING]
> If a consumer's `.gitignore` ignores a generated folder, that agent's files are never committed. Adopt and the consumer check both fail on it and list the hidden files. A bare `.claude` line is the usual culprit; replace it with:
> ```gitignore
> .claude/*
> !.claude/skills/
> !.claude/agents/
> !.claude/commands/
> !.claude/settings.json
> ```

**Check it works.** After merging the adoption PRs, roll the latest release out by hand:

```bash
gh workflow run sync.yml --repo <org>/agentbase --ref <release branch> -f ref=$(gh release view --repo <org>/agentbase --json tagName -q .tagName)
```

The *sync consumers* run should list your repos under `rollout`. A repo whose adoption PR is not merged yet is skipped with a notice, and one that is already on that release gets no PR.

That's it. From now on, every release opens a PR in every consumer repo it changes.

## Day to day

**Change something:** open a PR with a conventional title, squash-merge it. Repeat as often as you like.

| PR title | Release |
|---|---|
| `feat(groups): add api-design` | minor |
| `fix: ...`, `perf: ...` | patch |
| `feat!: ...` or `BREAKING CHANGE:` in the body | major |
| `docs:`, `chore:`, `refactor:`, `ci:`, ... | none |

[`pr-title.yml`](.github/workflows/pr-title.yml) rejects anything else. Changing what an agent is told or runs is `feat` or `fix`, not `docs`.

**Release:** *Actions → release → Run workflow* (or `gh workflow run release`).

| Step | What happens |
|---|---|
| [`release.yml`](.github/workflows/release.yml) | next version from the commits since the last tag; updates `CHANGELOG.md`, tags, publishes the GitHub release. No-op if nothing releasable. |
| [`sync.yml`](.github/workflows/sync.yml) | in every repo with topic `agentbase-consumer`: copies its groups at the new tag into `.agentbase/`, regenerates, and opens or updates PR `chore/agentbase-sync` if anything changed, listing what. |
| consumer CI | [`agentbase-check.yml`](templates/consumer-ci.yml) regenerates and fails on drift |

**Release from another branch:** set the Actions variable `RELEASE_BRANCH` (*Settings → Secrets and variables → Actions → Variables*) to release that branch instead of `main`, e.g. to keep `main` as a clean template while your own content lives elsewhere. The release workflow then refuses to run from any other branch; point the `release` environment at the same branch.

**Change a repo's groups or agents:** `npm run setup` → *Reconfigure an adopted repo*, pick the repo, adjust the prefilled groups and agents. Or non-interactively: `npm run reconfigure -- web --groups backend --targets claudecode,codexcli` (each flag sets the full list; `common` and the repo's own group are always kept). It opens a PR in that repo that keeps its agentbase release and regenerates for the new selection.

**Roll out to one repo only:** *Actions → sync consumers → Run workflow* on the release branch, set `ref` to a tag (e.g. `v1.2.0`) and `repo` to the repo name (e.g. `web`). Sync refuses to move a repo to an older tag unless you tick `force`.

**In a consumer repo:**
- `.agentbase/` is agentbase's; `.rulesync/` is the repo's own and wins on a name clash, so a local skill with the same name overrides the shared one.
- To change a repo's groups or agents, use reconfigure (above). Editing `groups` in `agentbase.json` by hand also works; the next agentbase release applies it.
- Never hand-edit generated files (`.claude/skills/`, `.agents/skills/`, …): CI rejects it and the next sync deletes it. A skill an agent writes there itself belongs in `.rulesync/skills/`.
- Repo-specific hooks go in the agentbase group named after the repo, not in `.claude/settings.json`, which generation rewrites.
- `AGENTS.md` / `CLAUDE.md` stay yours; agentbase never touches them.

## Security

What agentbase ships runs inside every developer's agent in every consumer: hooks and hook scripts execute commands, and a skill can pre-approve tools or run `` !`command` `` lines. Treat a merge to agentbase like a deploy:

- Require reviews on the release branch, and add `CODEOWNERS` for `groups/**/hooks.json`, `groups/**/scripts/` and `groups/**/subagents/`. The lint warnings mark what to look at.
- Keep the App key in the `release` environment (step 3) and protect `v*` tags (step 6).
- In consumers, append the `CODEOWNERS` lines `adopt.sh` prints, with a team as owner in an organization.
- Orgs that want only vetted hooks can combine this with Claude Code's managed settings, e.g. `allowManagedHooksOnly`.

## Gotchas

- Don't run `rulesync gitignore` in consumers; it would ignore the files that are committed on purpose.
- Don't set `targets` in subagent or command frontmatter; rulesync would then skip them for the other agents.
- A skill with `disable-model-invocation: true` also needs a `codexcli:` policy section, or Codex may still invoke it; the lint warns about it.
- A personal account can't approve its own PRs, so "Require review from Code Owners" blocks your own edits in consumers.
