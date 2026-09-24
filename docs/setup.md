# Setting up agentspread for your org

You need `gh` (logged in), Node 22+, and admin rights on the org. `npx agentspread init --force` overwrites an existing scaffold.

## 1. Create your content repo

```bash
gh repo create <org>/agentspread-config --private --clone
cd agentspread-config
npx agentspread init
```

Any name works. Private is the safer default: the repo holds your agents' prompts and hooks, and consumers need no token either way. `init` writes:

| File | Purpose |
|---|---|
| `groups/common/` | one placeholder skill, subagent and command |
| `.github/workflows/agentspread-release.yml` | the **release** workflow: versions, tags and rolls out |
| `.github/workflows/agentspread-sync.yml` | the **sync consumers** workflow: rolls an existing tag out again |
| `.github/workflows/agentspread-check.yml` | lints `groups/` and PR titles |
| `.github/dependabot.yml` | PRs when a new agentspread version is out |
| `package.json` | pins agentspread for `npm run onboard`, `npm run reconfigure` and `npm run lint` |
| `README.md`, `.gitignore` | a short guide for your team; `node_modules/` ignored |

The workflows call agentspread's reusable workflows at a pinned version. Nothing in the content repo lists consumer repos: sync finds them at run time by the `agentspread-consumer` topic.

## 2. Put your content in

Replace the placeholders in `groups/common/` with your own skills, subagents and commands, and add more groups if repos need different content. See [Writing groups](groups.md). `npm run lint` checks the result.

## 3. Create the GitHub App

Follow [The GitHub App](github-app.md). It ends with the App installed and its key stored in the `release` environment.

## 4. Cut the first release

Consumers pin a release, so one must exist before onboarding. Follow [Releasing](releasing.md): set squash merges to use the PR title, commit your content with a `feat` message, and run the **release** workflow. *Releases* then shows `v1.0.0`.

## 5. Onboard consumer repos

Give the App access to them first ([step 4 of the App guide](github-app.md#4-install-it)). Then, in the content repo:

```bash
npm install
npm run onboard
```

Pick the repos, the agents and the groups. Repos that need different groups are onboarded in separate runs. Each repo gets an adoption PR; see [Consumer repos](consumer-repos.md) for what it adds and what to watch for.

Non-interactive: `npx agentspread onboard web api --targets claudecode,codexcli --groups backend`.

## 6. Check it works

Merge the adoption PRs, then roll the latest release out by hand. Like the release, it must run from the release branch, since both use the `release` environment:

```bash
gh workflow run agentspread-sync.yml --repo <org>/agentspread-config -f ref=$(gh release view --repo <org>/agentspread-config --json tagName -q .tagName)
```

The *sync consumers* run lists your repos under `rollout`. A repo already on that release gets no PR; one whose adoption PR isn't merged yet is skipped with a notice.

From now on, every release opens a PR in every consumer repo it changes.

To release from a branch other than `main`, see [Releasing](releasing.md#releasing-from-a-branch-other-than-main).
