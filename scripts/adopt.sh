#!/usr/bin/env bash
# One-time onboarding of a consumer repo. Run from the consumer repo root:
#   bash <(curl -fsSL https://raw.githubusercontent.com/<org>/agentbase/main/scripts/adopt.sh) <org> [ref]
# Or with a local clone of agentbase: AGENTBASE_DIR=../agentbase scripts/adopt.sh <org> [ref]
set -euo pipefail

ORG="${1:?usage: adopt.sh <org> [ref]}"
REF="${2:-$(gh release view --repo "$ORG/agentbase" --json tagName -q .tagName 2>/dev/null || echo main)}"
TPL="${AGENTBASE_DIR:-}"
fetch_tpl() {
  if [ -n "$TPL" ]; then cat "$TPL/templates/$1"
  else curl -fsSL "https://raw.githubusercontent.com/$ORG/agentbase/$REF/templates/$1"
  fi
}

[ -d .git ] || { echo "run from the consumer repo root" >&2; exit 1; }

has_legacy_skills() {
  for p in .agents/skills .claude/skills .cursor/skills; do
    [ -e "$p" ] && return 0
  done
  return 1
}
if [ ! -d .rulesync ] && has_legacy_skills; then
  echo "▸ importing existing skills into .rulesync/skills/ (then delete the ones agentbase already ships)"
  # Symlinked skill dirs mirror another tool's dir; importing them too would duplicate every skill.
  [ -L .claude/skills ] || npx rulesync@16 import --targets claudecode --features skills || true
  [ -L .agents/skills ] || npx rulesync@16 import --targets codexcli --features skills || true
  [ -L .cursor/skills ] || npx rulesync@16 import --targets cursor --features skills || true
fi

echo "▸ writing rulesync.jsonc (ref=$REF)"
fetch_tpl rulesync.jsonc | sed -e "s#__ORG__#$ORG#g" -e "s#__REF__#$REF#g" > rulesync.jsonc

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
