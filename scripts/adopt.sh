#!/usr/bin/env bash
set -euo pipefail

# Kept in a variable rather than read back from $0: under `bash <(curl ...)` $0 is an already-drained pipe.
USAGE='One-time onboarding of a consumer repo. Run from the consumer repo root:
  bash <(curl -fsSL https://raw.githubusercontent.com/<owner>/agentbase/main/scripts/adopt.sh) <owner> [ref] \
       [--targets claudecode,codexcli] [--features skills] [--groups backend,web]
Any rulesync target/feature is accepted (`npx rulesync generate --help`).
Groups are folders under agentbase'"'"'s groups/: common is always included, and so is the group
named after this repo when it exists. The choice is recorded in agentbase.json.
With a local clone of agentbase: AGENTBASE_DIR=../agentbase scripts/adopt.sh <owner> [ref]'

TARGETS="claudecode,codexcli"
FEATURES="skills"
SKILL_GROUPS=""
POS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --targets)  TARGETS="$2"; shift 2 ;;
    --features) FEATURES="$2"; shift 2 ;;
    --groups)   SKILL_GROUPS="$SKILL_GROUPS,$2"; shift 2 ;;
    --groups=*) SKILL_GROUPS="$SKILL_GROUPS,${1#*=}"; shift ;;
    --targets=*)  TARGETS="${1#*=}"; shift ;;
    --features=*) FEATURES="${1#*=}"; shift ;;
    -h|--help) echo "$USAGE"; exit 0 ;;
    *) POS+=("$1"); shift ;;
  esac
done
set -- "${POS[@]:-}"
ORG="${1:?usage: adopt.sh <owner> [ref] [--targets a,b] [--features skills,rules]}"
REF="${2:-$(gh release view --repo "$ORG/agentbase" --json tagName -q .tagName 2>/dev/null || echo main)}"

json_list() { printf '"%s"' "${1//,/\", \"}"; }
TPL="${AGENTBASE_DIR:-}"
fetch_file() {
  if [ -n "$TPL" ]; then cat "$TPL/$1"
  else curl -fsSL "https://raw.githubusercontent.com/$ORG/agentbase/$REF/$1"
  fi
}
fetch_tpl() { fetch_file "templates/$1"; }

[ -d .git ] || { echo "run from the consumer repo root" >&2; exit 1; }
REPO_NAME=$(basename "$(git rev-parse --show-toplevel)")

if [ ! -d .rulesync ]; then
  echo "▸ importing existing tool config into .rulesync/ (then delete what agentbase already ships)"
  for t in ${TARGETS//,/ }; do
    # A symlinked root file mirrors another tool's; importing it too would duplicate the root rule.
    case "$t" in
      claudecode) [ -L CLAUDE.md ] && continue ;;
      codexcli|antigravity-*) [ -L AGENTS.md ] && continue ;;
    esac
    npx --yes rulesync@16 import --targets "$t" --features "$FEATURES" || true
  done
fi

echo "▸ writing rulesync.jsonc (ref=$REF, targets=$TARGETS, features=$FEATURES)"
fetch_tpl rulesync.jsonc \
  | sed -e "s#__TARGETS__#$(json_list "$TARGETS")#" -e "s#__FEATURES__#$(json_list "$FEATURES")#" > rulesync.jsonc

echo "▸ .gitignore"
if ! grep -q '.rulesync/skills/.curated/' .gitignore 2>/dev/null; then
  { [ -f .gitignore ] && [ -n "$(tail -c1 .gitignore)" ] && echo; fetch_tpl gitignore; } >> .gitignore
fi

mkdir -p .claude
[ -f .claude/settings.json ] || echo '{}' > .claude/settings.json

echo "▸ groups, skill sources and Claude Code plugins"
# The same script sync runs on every release, fetched from the pinned ref so both agree on the layout.
apply_script="$(mktemp -d)/sync-consumer.mjs"
fetch_file scripts/sync-consumer.mjs > "$apply_script"
node "$apply_script" apply "$REF" "$ORG" "$REPO_NAME" "$SKILL_GROUPS"

echo "▸ CI workflow"
mkdir -p .github/workflows
[ -f .github/workflows/agentbase-check.yml ] || fetch_tpl consumer-ci.yml > .github/workflows/agentbase-check.yml

echo "▸ removing skill-dir symlinks (generated dirs replace them; AGENTS.md/CLAUDE.md are left alone)"
for d in .claude/skills .cursor/skills .agents/skills; do [ -L "$d" ] && rm -v "$d"; done || true

echo "▸ install + generate"
npx --yes rulesync@16 install
npx --yes rulesync@16 generate

echo "▸ checking .gitignore does not hide generated files"
# check-ignore -v also reports `!` rules that re-include a file, which are not a problem.
ignored=$(
  { find . \( -path ./.git -o -path ./.rulesync -o -path ./node_modules \) -prune -o -type f -path '*/skills/*/SKILL.md' -print
    [ -f .claude/settings.json ] && echo ./.claude/settings.json; } | git check-ignore -v --stdin | grep -Ev '^[^:]*:[0-9]+:!' || true
)
if [ -n "$ignored" ]; then
  echo "✗ these .gitignore rules hide generated files, so they would never be committed:" >&2
  echo "$ignored" | cut -f1 | sort -u | sed 's/^/    /' >&2
  echo "  Un-ignore them (e.g. replace '.claude' with '.claude/*', '!.claude/skills/', '!.claude/settings.json') and re-run." >&2
  exit 1
fi

echo "▸ repo topic"
gh repo edit "$ORG/$REPO_NAME" --add-topic agentbase-consumer 2>/dev/null \
  || echo "  add the GitHub topic 'agentbase-consumer' manually (gh not authenticated)"

cat <<MSG

Done. Review and commit:
  - agentbase.json, rulesync.jsonc, rulesync.lock, .gitignore, .claude/settings.json, .github/workflows/agentbase-check.yml
  - .rulesync/skills/     ← repo-specific skills only; delete anything agentbase already ships
  - generated tool files  ← commit them; never edit by hand
Append to CODEOWNERS:
MSG
fetch_tpl codeowners-snippet | sed "s#__ORG__#$ORG#g"
