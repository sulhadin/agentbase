#!/usr/bin/env bash
set -euo pipefail

USAGE='Adopt agentbase in consumer repos and open a PR in each:
  npm run onboard -- <repo>... [--targets claudecode,codexcli] [--features skills] [--groups backend,web]
<repo> is a name under the agentbase owner, or owner/name.
The GitHub App must have access to each repo for later sync PRs.'

ROOT=$(cd "$(dirname "$0")/.." && pwd)
OWNER=$(cd "$ROOT" && gh repo view --json owner -q .owner.login)
BRANCH=chore/adopt-agentbase

REPOS=()
ADOPT_FLAGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --targets|--features|--groups) ADOPT_FLAGS+=("$1" "$2"); shift 2 ;;
    --targets=*|--features=*|--groups=*) ADOPT_FLAGS+=("$1"); shift ;;
    -h|--help) echo "$USAGE"; exit 0 ;;
    *) REPOS+=("$1"); shift ;;
  esac
done
[ ${#REPOS[@]} -gt 0 ] || { echo "$USAGE" >&2; exit 1; }

pr_body() {
  cat <<EOF
## Changelog
- Pin shared AI agent skills to agentbase \`$1\` via \`rulesync.jsonc\` / \`rulesync.lock\`.
- Add generated \`.claude/skills/\` and \`.agents/skills/\`, the agentbase Claude Code plugin and the \`agentbase check\` drift workflow.

## Description
Onboards this repo to agentbase: future agentbase releases arrive here as automated PRs.

## Before merge
- Delete from \`.rulesync/skills/\` anything agentbase now ships, then run \`npx rulesync@16 generate\`.
- Groups live in \`agentbase.json\`; change them there and the next agentbase release applies it.
EOF
}

adoption_details() {
  local targets groups skills generated
  targets=$(grep -oE '"targets": *\[[^]]*\]' rulesync.jsonc | grep -oE '"[a-z-]+"' | tr -d '"' | grep -vx targets | paste -sd, - | sed 's/,/, /g')
  groups=$(node -e 'console.log(require("./agentbase.json").groups.join(", "))')
  skills=$(node -e 'const l=JSON.parse(require("fs").readFileSync("rulesync.lock","utf8")); console.log(Object.values(l.sources).flatMap(s=>Object.keys(s.skills??{})).join(", "))')
  generated=$(git diff --cached --name-only | sed -nE 's#^((\.[^/]+/)+skills)/[^/]+/SKILL\.md$#\1/#p' | grep -v '^\.rulesync/' | sort -u | paste -sd, - | sed 's/,/, /g')
  cat <<EOF
Pin $OWNER/agentbase $1 in rulesync.jsonc and generate its
skills for $targets.

Groups: $groups
Skills: $skills
Generated: $generated
EOF
}

FAILED=()
for repo in "${REPOS[@]}"; do
  [[ "$repo" == */* ]] || repo="$OWNER/$repo"
  echo "━━ $repo"

  if ! gh repo view "$repo" --json name >/dev/null 2>&1; then
    echo "  ✗ repo not found or no access" >&2; FAILED+=("$repo"); continue
  fi
  if gh api "repos/$repo/contents/rulesync.jsonc" >/dev/null 2>&1; then
    echo "  already adopted, skipping"; continue
  fi
  open_pr=$(gh pr list -R "$repo" --head "$BRANCH" --json url -q '.[0].url')
  if [ -n "$open_pr" ]; then
    echo "  adoption PR already open: $open_pr"; continue
  fi

  # adopt.sh derives the repo for the topic from the checkout's directory name.
  dir="$(mktemp -d)/${repo#*/}"
  # A subshell tested by `if` runs with errexit off, so capture its status instead.
  set +e
  (
    set -e
    gh repo clone "$repo" "$dir" -- --quiet
    cd "$dir"
    git switch -q -c "$BRANCH"
    # Templates from this checkout, so they always match the adopt.sh that fills them in.
    AGENTBASE_DIR="$ROOT" bash "$ROOT/scripts/adopt.sh" "$OWNER" ${ADOPT_FLAGS[@]+"${ADOPT_FLAGS[@]}"}
    ref=$(grep -oE '"ref": *"[^"]+"' rulesync.jsonc | head -1 | sed -E 's/.*"([^"]+)"$/\1/')
    git add -A
    title="chore(agentbase): adopt shared AI agent skills at $ref"
    git commit -q -F - <<EOF
$title

$(adoption_details "$ref")
EOF
    # Open PRs were skipped above, so a remote branch here is left over from a closed one.
    git push -q -u --force origin "$BRANCH"
    gh pr create --title "$title" --body "$(pr_body "$ref")"
  )
  status=$?
  set -e
  if [ $status -eq 0 ]; then
    rm -rf "$dir"
  else
    echo "  ✗ failed; checkout left at $dir" >&2
    FAILED+=("$repo")
  fi
done

[ ${#FAILED[@]} -eq 0 ] || { echo "Failed: ${FAILED[*]}" >&2; exit 1; }
