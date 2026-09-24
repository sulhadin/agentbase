#!/usr/bin/env bash
set -euo pipefail

USAGE='Change a consumer'"'"'s groups and agents, keeping its release, and open a PR. Run inside the content repo:
  npx agentspread reconfigure <repo> --groups backend,web --targets claudecode,codexcli
--groups sets the full list (common and the group named after the repo are always kept);
--targets sets the full list of rulesync targets. Either may be left out to keep it as is.'

ROOT="${AGENTSPREAD_ROOT:-$(cd "$(dirname "$0")/.." && pwd)/}"
SOURCE=$(gh repo view --json nameWithOwner -q .nameWithOwner) \
  || { echo "✗ run this inside the content repo (a GitHub checkout with groups/)" >&2; exit 1; }
OWNER="${SOURCE%%/*}"
BRANCH=chore/agentspread-reconfigure

REPO=""
APPLY_FLAGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --groups)  APPLY_FLAGS+=(--set-groups "$2"); shift 2 ;;
    --targets) APPLY_FLAGS+=(--targets "$2"); shift 2 ;;
    -h|--help) echo "$USAGE"; exit 0 ;;
    *) [ -z "$REPO" ] || { echo "$USAGE" >&2; exit 1; }; REPO="$1"; shift ;;
  esac
done
[ -n "$REPO" ] && [ ${#APPLY_FLAGS[@]} -gt 0 ] || { echo "$USAGE" >&2; exit 1; }
[[ "$REPO" == */* ]] || REPO="$OWNER/$REPO"

describe() {
  printf 'groups: %s; agents: %s' \
    "$(node -e 'console.log(require("./agentspread.json").groups.join(", "))')" \
    "$(grep -oE '"targets": *\[[^]]*\]' rulesync.jsonc | grep -oE '"[a-z-]+"' | tr -d '"' | grep -vx targets | paste -sd, - | sed 's/,/, /g')"
}

dir="$(mktemp -d)/${REPO#*/}"
gh repo clone "$REPO" "$dir" -- --quiet
cd "$dir"
[ -f agentspread.json ] || { echo "✗ $REPO has no agentspread.json yet: adopt it, or wait for its first sync" >&2; exit 1; }
git switch -q -c "$BRANCH"

ref=$(node -e 'console.log(require("./agentspread.json").ref)')
source=$(node -e 'console.log(require("./agentspread.json").source)')
before=$(describe)
node "${ROOT}scripts/sync-consumer.mjs" apply "$ref" "$source" "${REPO#*/}" "${APPLY_FLAGS[@]}"
npx --yes rulesync@16 generate --delete
after=$(describe)

ignored=$(git ls-files --others --ignored --exclude-standard -- .agentspread .claude .agents .codex .github \
  .cursor .opencode .cline .roo .kiro .junie .warp .qwen .augment | grep -v '\.local\.' || true)
[ -z "$ignored" ] || { echo "✗ .gitignore hides generated files:" >&2; echo "$ignored" | sed 's/^/    /' >&2; exit 1; }

if [ -z "$(git status --porcelain)" ]; then
  echo "$REPO already has $after; nothing to do."
  exit 0
fi

title="chore(agentspread): reconfigure groups and agents"
git add -A
git commit -q -F - <<EOF
$title

Keep $source $ref and regenerate for the new selection.

Before: $before
After: $after
EOF
# Reruns reuse the branch; an open reconfigure PR is updated rather than duplicated.
git push -q -u --force origin "$BRANCH"
existing=$(gh pr list -R "$REPO" --head "$BRANCH" --json url -q '.[0].url')
if [ -n "$existing" ]; then
  echo "updated $existing"
else
  gh pr create -R "$REPO" --head "$BRANCH" --title "$title" --body "## Changelog
- Before: $before
- After: $after

## Description
Changes which groups and agents this repo gets from \`$source\`, staying on \`$ref\`. Later releases keep this selection."
fi
