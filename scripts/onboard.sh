#!/usr/bin/env bash
set -euo pipefail

USAGE='Make repos consumers of this content repo and open a PR in each. Run inside the content repo:
  npx agentbase onboard <repo>... [--targets claudecode,codexcli] [--groups backend,web]
<repo> is a name under the content repo'"'"'s owner, or owner/name.
The GitHub App must have access to each repo for later sync PRs.'

ROOT="${AGENTBASE_ROOT:-$(cd "$(dirname "$0")/.." && pwd)/}"
SOURCE=$(gh repo view --json nameWithOwner -q .nameWithOwner) \
  || { echo "✗ run this inside the content repo (a GitHub checkout with groups/)" >&2; exit 1; }
OWNER="${SOURCE%%/*}"
BRANCH=chore/adopt-agentbase

REPOS=()
ADOPT_FLAGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --targets|--groups) ADOPT_FLAGS+=("$1" "$2"); shift 2 ;;
    --targets=*|--groups=*) ADOPT_FLAGS+=("$1"); shift ;;
    -h|--help) echo "$USAGE"; exit 0 ;;
    *) REPOS+=("$1"); shift ;;
  esac
done
[ ${#REPOS[@]} -gt 0 ] || { echo "$USAGE" >&2; exit 1; }

pr_body() {
  cat <<EOF
## Changelog
- Copy \`$SOURCE\` \`$1\` into \`.agentbase/\` (groups in \`agentbase.json\`) and generate every chosen agent's files from it and \`.rulesync/\`.
- Add the \`agentbase check\` drift workflow.

## Description
Makes this repo a consumer of \`$SOURCE\`: its future releases arrive here as automated PRs.

## Before merge
- Review \`.agentbase/hooks.json\` and \`.agentbase/scripts/\` if present: hooks run on every developer machine.
- If this repo had its own skills, they are in \`.rulesync/\`; delete any that agentbase now ships and run \`npx rulesync@16 generate --delete\`.
- Groups and agents can be changed later with \`npx agentbase setup\` in \`$SOURCE\`.
EOF
}

adoption_details() {
  local targets groups parts generated
  targets=$(grep -oE '"targets": *\[[^]]*\]' rulesync.jsonc | grep -oE '"[a-z-]+"' | tr -d '"' | grep -vx targets | paste -sd, - | sed 's/,/, /g')
  groups=$(node -e 'console.log(require("./agentbase.json").groups.join(", "))')
  parts=$(for k in skills subagents commands; do
    n=$(ls ".agentbase/$k" 2>/dev/null | sed 's/\.md$//' | paste -sd, - | sed 's/,/, /g')
    [ -z "$n" ] || echo "$k: $n"
  done; [ ! -f .agentbase/hooks.json ] || echo "hooks: yes")
  generated=$(git diff --cached --name-only | grep -v '^\.agentbase/\|^\.rulesync/' | cut -d/ -f1-2 | sort -u | paste -sd, - | sed 's/,/, /g')
  cat <<EOF
Copy $SOURCE $1 into .agentbase/ and generate files for
$targets.

Groups: $groups
$parts
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

  dir="$(mktemp -d)/${repo#*/}"
  # A subshell tested by `if` runs with errexit off, so capture its status instead.
  set +e
  (
    set -e
    gh repo clone "$repo" "$dir" -- --quiet
    cd "$dir"
    git switch -q -c "$BRANCH"
    bash "${ROOT}scripts/adopt.sh" "$SOURCE" ${ADOPT_FLAGS[@]+"${ADOPT_FLAGS[@]}"}
    ref=$(node -e 'console.log(require("./agentbase.json").ref)')
    git add -A
    title="chore(agentbase): adopt shared AI agent config at $ref"
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
