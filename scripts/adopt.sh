#!/usr/bin/env bash
set -euo pipefail

# Kept in a variable rather than read back from $0: under `bash <(curl ...)` $0 is an already-drained pipe.
USAGE='One-time onboarding of a consumer repo. Run from the consumer repo root:
  bash <(curl -fsSL https://raw.githubusercontent.com/<owner>/agentbase/main/scripts/adopt.sh) <owner> [ref] \
       [--targets claudecode,codexcli] [--groups backend,web]
Groups are folders under agentbase'"'"'s groups/: common is always included, and so is the group named
after this repo when it exists. The choice is recorded in agentbase.json.
With a local clone of agentbase: AGENTBASE_DIR=../agentbase scripts/adopt.sh <owner> [ref]'

TARGETS="claudecode,codexcli"
SKILL_GROUPS=""
POS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --targets)  TARGETS="$2"; shift 2 ;;
    --targets=*)  TARGETS="${1#*=}"; shift ;;
    --groups)   SKILL_GROUPS="$SKILL_GROUPS,$2"; shift 2 ;;
    --groups=*) SKILL_GROUPS="$SKILL_GROUPS,${1#*=}"; shift ;;
    -h|--help) echo "$USAGE"; exit 0 ;;
    *) POS+=("$1"); shift ;;
  esac
done
set -- "${POS[@]:-}"
ORG="${1:?usage: adopt.sh <owner> [ref] [--targets a,b] [--groups a,b]}"
# main is the clean template, so pinning to it would ship placeholders.
REF="${2:-$(gh release view --repo "$ORG/agentbase" --json tagName -q .tagName)}"
[ -n "$REF" ] || { echo "✗ $ORG/agentbase has no release yet; cut one first" >&2; exit 1; }

[ -d .git ] || { echo "run from the consumer repo root" >&2; exit 1; }
REPO_NAME=$(gh repo view --json name -q .name 2>/dev/null || basename "$(git rev-parse --show-toplevel)")

TPL="${AGENTBASE_DIR:-}"
fetch_file() {
  if [ -n "$TPL" ]; then cat "$TPL/$1"
  else curl -fsSL "https://raw.githubusercontent.com/$ORG/agentbase/$REF/$1"
  fi
}
work=$(mktemp -d)
json_list() { printf '"%s"' "${1//,/\", \"}"; }

if [ ! -d .rulesync ]; then
  echo "▸ importing this repo's existing skills, subagents and commands into .rulesync/"
  for t in ${TARGETS//,/ }; do
    npx --yes rulesync@16 import --targets "$t" --features skills,subagents,commands || true
  done
fi

if [ -f rulesync.jsonc ]; then
  echo "▸ keeping the existing rulesync.jsonc"
else
  echo "▸ writing rulesync.jsonc (targets=$TARGETS)"
  fetch_file templates/rulesync.jsonc | sed -e "s#__TARGETS__#$(json_list "$TARGETS")#" > "$work/rulesync.jsonc"
  mv "$work/rulesync.jsonc" rulesync.jsonc
fi

echo "▸ copying agentbase $REF into .agentbase/"
# The same script sync runs on every release, fetched from the pinned ref so both agree on the layout.
fetch_file scripts/sync-consumer.mjs > "$work/sync-consumer.mjs"
# Content always comes from $REF itself, never from a local AGENTBASE_DIR that may be ahead of it.
node "$work/sync-consumer.mjs" apply "$REF" "$ORG" "$REPO_NAME" --groups "$SKILL_GROUPS"

echo "▸ CI workflow"
mkdir -p .github/workflows
[ -f .github/workflows/agentbase-check.yml ] || fetch_file templates/consumer-ci.yml > .github/workflows/agentbase-check.yml

echo "▸ generating agent files"
npx --yes rulesync@16 generate --delete

echo "▸ checking .gitignore does not hide generated files"
ignored=$(git ls-files --others --ignored --exclude-standard -- .agentbase .claude .agents .codex .github \
  .cursor .opencode .cline .roo .kiro .junie .warp .qwen .augment | grep -v '\.local\.' || true)
if [ -n "$ignored" ]; then
  echo "✗ .gitignore hides these generated files, so they would never be committed:" >&2
  echo "$ignored" | sed 's/^/    /' >&2
  echo "  Un-ignore them (e.g. replace '.claude' with '.claude/*' plus '!.claude/skills/', '!.claude/agents/'," >&2
  echo "  '!.claude/commands/', '!.claude/settings.json') and re-run." >&2
  exit 1
fi

echo "▸ repo topic"
gh repo edit "$ORG/$REPO_NAME" --add-topic agentbase-consumer 2>/dev/null \
  || echo "  add the GitHub topic 'agentbase-consumer' manually (gh could not edit $ORG/$REPO_NAME)"

cat <<MSG

Done. Review and commit everything, generated files included:
  - agentbase.json          ← this repo's groups; change them here
  - .agentbase/             ← agentbase's content at $REF; never edit by hand
  - rulesync.jsonc, .github/workflows/agentbase-check.yml, generated agent folders
  - .rulesync/              ← this repo's own skills; delete any that agentbase now ships
Append to CODEOWNERS (use a team, e.g. @org/platform, for an organization):
MSG
fetch_file templates/codeowners-snippet | sed "s#__ORG__#$ORG#g"
