<h1 align="center">agentspread</h1>

<p align="center">
  <a href="https://github.com/sulhadin/agentspread/actions/workflows/ci.yml"><img alt="ci" src="https://github.com/sulhadin/agentspread/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/sulhadin/agentspread/releases"><img alt="release" src="https://img.shields.io/github/v/release/sulhadin/agentspread?include_prereleases"></a>
  <a href="https://github.com/dyoshikawa/rulesync"><img alt="powered by rulesync" src="https://img.shields.io/badge/powered%20by-rulesync-blue"></a>
</p>

<p align="center">
<b>Write your AI agent skills, subagents, commands and hooks once. Every repo gets them as a PR.</b><br>
Claude Code · Codex · Cursor · Antigravity · Copilot · OpenCode · and more
</p>

---

Teams copy the same agent config into every repo, and the copies drift. agentspread keeps it in **one repo**, split into groups (org-wide, per platform, per repo). Merge conventional-commit PRs, press *Run workflow*, and each consumer repo gets a pull request with exactly its groups, generated for every AI tool it uses. Versions, tags and `CHANGELOG.md` are computed for you.

```
 your-org/agentspread-config (content repo)           each consumer repo
 ─────────────────────────────────           ──────────────────
 groups/common/  ─┐                          PR "chore(agentspread): update shared AI agent config to v1.2.0"
 groups/backend/ ─┼─ release v1.2.0 ──────▶    .agentspread/      its groups, copied at v1.2.0
 groups/web/     ─┘                             .claude/           skills, agents, commands, hooks → Claude Code
                                                .agents/skills/    → Codex, Cursor, Antigravity, Copilot, OpenCode
                                                .codex/            agents, hooks → Codex
```

agentspread is the engine: an npm package (`npx agentspread …`) plus reusable GitHub workflows. Your **content repo** holds only your groups and three small workflow files that call agentspread at a pinned version, and Dependabot opens a PR when a new agentspread version is out. Sync copies each release into the consumer's committed `.agentspread/`, and [rulesync](https://github.com/dyoshikawa/rulesync) generates each tool's files from it. Everything is committed, so every clone and cloud agent session sees it without a build step or a token.

## Get started

You need `gh` (logged in), Node 22+, and admin rights on the org. The full walkthrough is in [docs/setup.md](docs/setup.md).

1. **Create the content repo:** `gh repo create <org>/agentspread-config --private --clone && cd agentspread-config && npx agentspread init`
2. **Add your content** under `groups/`: see [Writing groups](docs/groups.md).
3. **Create the GitHub App** that opens the PRs: see [The GitHub App](docs/github-app.md).
4. **Release:** commit with a `feat:` message, then *Actions → release → Run workflow*.
5. **Onboard repos:** `npm install && npm run setup`, pick repos, agents and groups, and merge the adoption PRs. See [Consumer repos](docs/consumer-repos.md).

## Day to day

**Change something:** open a PR with a conventional title and squash-merge it.

| PR title | Release |
|---|---|
| `feat(groups): add api-design` | minor |
| `fix: ...`, `perf: ...` | patch |
| `feat!: ...` or `BREAKING CHANGE:` in the body | major |
| `docs:`, `chore:`, `refactor:`, `ci:`, ... | none |

Changing what an agent is told or runs is `feat` or `fix`, not `docs`.

**Release:** *Actions → release → Run workflow*. It computes the version, updates `CHANGELOG.md`, tags, and opens or updates a `chore/agentspread-sync` PR in every consumer repo whose content changed.

**Change a repo's groups or agents:** `npm run setup` → *Reconfigure an adopted repo*, or `npx agentspread reconfigure web --groups backend --targets claudecode,codexcli`. Each flag sets the full list; `common` and the repo's own group are always kept.

**Roll out to one repo:** *Actions → sync consumers → Run workflow* with `ref` set to a tag and `repo` to the repo name. Rolling back to an older tag needs `force`.

**Update agentspread:** Dependabot opens a PR for the workflow pins and one for `package.json`; merge both. Consumers pick up the new engine on the content repo's next release.

## Docs

- [Setup walkthrough](docs/setup.md)
- [Writing groups](docs/groups.md)
- [The GitHub App](docs/github-app.md)
- [Consumer repos](docs/consumer-repos.md)
- [Security](docs/security.md)
- [Why agentspread over plain rulesync](docs/why-not-rulesync.md)
- [Developing agentspread](docs/development.md)

## License

[MIT](LICENSE)
