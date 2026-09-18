#!/usr/bin/env bash
# One-time onboarding of a consumer repo. Run from the consumer repo root:
#   bash <(curl -fsSL https://raw.githubusercontent.com/<org>/agentbase/main/scripts/adopt.sh) <org> [ref] \
#        [--targets claudecode,codexcli] [--features skills]
# Any rulesync target/feature is accepted (`npx rulesync generate --help`).
# With a local clone of agentbase: AGENTBASE_DIR=../agentbase scripts/adopt.sh <org> [ref]
set -euo pipefail

TARGETS="claudecode,codexcli"
FEATURES="skills"
POS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --targets)  TARGETS="$2"; shift 2 ;;
    --features) FEATURES="$2"; shift 2 ;;
    --targets=*)  TARGETS="${1#*=}"; shift ;;
    --features=*) FEATURES="${1#*=}"; shift ;;
    -h|--help) sed -n '2,6p' "$0"; exit 0 ;;
    *) POS+=("$1"); shift ;;
  esac
done
set -- "${POS[@]:-}"
ORG="${1:?usage: adopt.sh <org> [ref] [--targets a,b] [--features skills,rules]}"
REF="${2:-$(gh release view --repo "$ORG/agentbase" --json tagName -q .tagName 2>/dev/null || echo main)}"

json_list() { printf '"%s"' "${1//,/\", \"}"; }
SELECTION=""
case ",$FEATURES," in *,rules,*) SELECTION='"rules": ["*"], ';; esac
case ",$FEATURES," in *,skills,*) SELECTION="$SELECTION"'"skills": ["*"]';; esac
SELECTION="${SELECTION%, }"
TPL="${AGENTBASE_DIR:-}"
fetch_tpl() {
  if [ -n "$TPL" ]; then cat "$TPL/templates/$1"
  else curl -fsSL "https://raw.githubusercontent.com/$ORG/agentbase/$REF/templates/$1"
  fi
}

[ -d .git ] || { echo "run from the consumer repo root" >&2; exit 1; }

if [ ! -d .rulesync ]; then
  echo "▸ importing existing tool config into .rulesync/ (then delete what agentbase already ships)"
  for t in ${TARGETS//,/ }; do
    # A symlinked root file mirrors another tool's; importing it too would duplicate the root rule.
    case "$t" in
      claudecode) [ -L CLAUDE.md ] && continue ;;
      codexcli|antigravity-*) [ -L AGENTS.md ] && continue ;;
    esac
    npx rulesync@16 import --targets "$t" --features "$FEATURES" || true
  done
fi

echo "▸ writing rulesync.jsonc (ref=$REF, targets=$TARGETS, features=$FEATURES)"
fetch_tpl rulesync.jsonc \
  | sed -e "s#__ORG__#$ORG#g" -e "s#__REF__#$REF#g" \
        -e "s#__TARGETS__#$(json_list "$TARGETS")#" -e "s#__FEATURES__#$(json_list "$FEATURES")#" \
        -e "s#__SELECTION__#$SELECTION#" > rulesync.jsonc

echo "▸ .gitignore"
if ! grep -q '.rulesync/skills/.curated/' .gitignore 2>/dev/null; then
  { [ -f .gitignore ] && [ -n "$(tail -c1 .gitignore)" ] && echo; fetch_tpl gitignore; } >> .gitignore
fi

echo "▸ .claude/settings.json (plugin marketplace)"
mkdir -p .claude
if [ -f .claude/settings.json ]; then
  echo "  .claude/settings.json exists — merge templates/claude-settings.json by hand"
else
  fetch_tpl claude-settings.json | sed "s#__ORG__#$ORG#g" > .claude/settings.json
fi

echo "▸ CI workflow"
mkdir -p .github/workflows
[ -f .github/workflows/agentbase-check.yml ] || fetch_tpl consumer-ci.yml > .github/workflows/agentbase-check.yml

echo "▸ removing skill-dir symlinks (generated dirs replace them; AGENTS.md/CLAUDE.md are left alone)"
for d in .claude/skills .cursor/skills .agents/skills; do [ -L "$d" ] && rm -v "$d"; done || true

echo "▸ install + generate"
npx rulesync@16 install
npx rulesync@16 generate

echo "▸ repo topic"
gh repo edit "$ORG/$(basename "$(git rev-parse --show-toplevel)")" --add-topic agentbase-consumer 2>/dev/null \
  || echo "  add the GitHub topic 'agentbase-consumer' manually (gh not authenticated)"

cat <<MSG

Done. Review and commit:
  - rulesync.jsonc, rulesync.lock, .gitignore, .claude/settings.json, .github/workflows/agentbase-check.yml
  - .rulesync/skills/     ← repo-specific skills only; delete anything agentbase already ships
  - generated tool files  ← commit them; never edit by hand
Append templates/codeowners-snippet to CODEOWNERS.
MSG
