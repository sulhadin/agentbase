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

has_legacy_config() {
  for p in CLAUDE.md AGENTS.md .claude/rules .cursor/rules .agents/skills .claude/skills; do
    [ -e "$p" ] && return 0
  done
  return 1
}
if [ ! -d .rulesync ] && has_legacy_config; then
  echo "▸ importing existing tool config into .rulesync/ (review the result, then delete what agentbase already provides)"
  # A symlinked root file is a mirror of another tool's file; importing it too would duplicate the root rule.
  [ -L CLAUDE.md ] || npx rulesync@16 import --targets claudecode --features rules,skills || true
  [ -L AGENTS.md ] || npx rulesync@16 import --targets codexcli --features rules,skills || true
  npx rulesync@16 import --targets cursor --features rules,skills || true
  [ -d .rulesync ] || { echo "import produced nothing; refusing to overwrite existing config" >&2; exit 1; }
fi

echo "▸ writing rulesync.jsonc (ref=$REF)"
fetch_tpl rulesync.jsonc | sed -e "s#__ORG__#$ORG#g" -e "s#__REF__#$REF#g" > rulesync.jsonc

echo "▸ .gitignore"
if ! grep -q '.rulesync/rules/.curated/' .gitignore 2>/dev/null; then
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

echo "▸ removing symlinks into .agents/ (generated files replace them)"
find . -maxdepth 1 -type l \( -name CLAUDE.md -o -name AGENTS.md -o -name GEMINI.md \) -exec rm -v {} +
find .claude .cursor .gemini .codex .github .agents -maxdepth 3 -type l -exec rm -v {} + 2>/dev/null || true
rm -f GEMINI.md 2>/dev/null && echo "  removed GEMINI.md (antigravity-cli reads AGENTS.md)" || true

echo "▸ install + generate"
npx rulesync@16 install
npx rulesync@16 generate

echo "▸ repo topic"
gh repo edit "$ORG/$(basename "$(git rev-parse --show-toplevel)")" --add-topic agentbase-consumer 2>/dev/null \
  || echo "  add the GitHub topic 'agentbase-consumer' manually (gh not authenticated)"

cat <<MSG

Done. Review and commit:
  - rulesync.jsonc, rulesync.lock, .gitignore, .claude/settings.json, .github/workflows/agentbase-check.yml
  - .rulesync/            ← repo-specific rules/skills only; delete anything agentbase already ships
  - generated tool files  ← commit them; never edit by hand
Append templates/codeowners-snippet to CODEOWNERS.
MSG
