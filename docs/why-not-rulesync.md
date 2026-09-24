# Why agentspread over plain rulesync

rulesync does the conversion: agentspread uses it to write each agent's files. What rulesync leaves to you is getting shared content into many repos and keeping it current. That is the part agentspread adds.

| Need | rulesync alone | agentspread |
|---|---|---|
| Convert one source into every agent's format | ✅ | ✅ (through rulesync) |
| Pull shared content from a central repo | `sources` fetches **skills and rules only** | Skills, subagents, commands, hooks and the scripts hooks run |
| Ship a new version to every repo | Someone bumps `ref` in each repo by hand | A release opens a PR in every consumer repo, found by topic |
| Versions and changelog | None | Computed from conventional commits |
| Different content per repo | Each repo lists the source paths it wants by hand; a path that doesn't exist fails the install | Groups: org-wide, per platform, per repo (a group named after a repo attaches to it on its own) |
| Change a repo's selection later | Edit its config by hand | `npm run reconfigure` opens a PR |
| Regenerate in CI without network or a token | `install` fetches at CI time; a private source needs a token in every repo | Content is committed in `.agentspread/`; consumer CI needs neither |
| Catch hand edits and files that never got committed | `install --frozen` checks the lockfile | CI regenerates and fails on edits, uncommitted output and `.gitignore` rules that hide it |
| Review what runs on developers' machines | No checks | Lint flags hooks, `allowed-tools`, `` !`command` `` lines and frontmatter hooks |
| Roll out safely | — | No silent downgrades, one rollout per repo at a time, scoped App tokens, release key limited to one branch |

If you only share skills across a handful of repos and don't mind bumping a ref in each, rulesync's `sources` alone is enough.
