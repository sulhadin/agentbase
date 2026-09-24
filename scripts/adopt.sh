#!/usr/bin/env bash
set -euo pipefail

USAGE='Adopt the current repo as a consumer of a content repo. Run from the consumer repo root:
  npx agentbase adopt <content owner/repo> [ref] [--targets claudecode,codexcli] [--groups backend,web]
ref defaults to the content repo'"'"'s latest release. Groups are folders under its groups/: common is
always included, and so is the group named after this repo when it exists. The choice is recorded in
agentbase.json.'

ROOT="${AGENTBASE_ROOT:-$(cd "$(dirname "$0")/.." && pwd)/}"
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
SOURCE="${1:?$USAGE}"
[[ "$SOURCE" == */* ]] || { echo "✗ the content repo is owner/name, got '$SOURCE'" >&2; exit 1; }
REF="${2:-$(gh release view --repo "$SOURCE" --json tagName -q .tagName)}"
[ -n "$REF" ] || { echo "✗ $SOURCE has no release yet; cut one first" >&2; exit 1; }

[ -d .git ] || { echo "run from the consumer repo root" >&2; exit 1; }
REPO_NAME=$(gh repo view --json name -q .name 2>/dev/null || basename "$(git rev-parse --show-toplevel)")
OWNER=$(gh repo view --json owner -q .owner.login 2>/dev/null || echo "${SOURCE%%/*}")
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
  sed -e "s#__TARGETS__#$(json_list "$TARGETS")#" "${ROOT}templates/consumer/rulesync.jsonc" > "$work/rulesync.jsonc"
  mv "$work/rulesync.jsonc" rulesync.jsonc
fi

echo "▸ copying $SOURCE $REF into .agentbase/"
node "${ROOT}scripts/sync-consumer.mjs" apply "$REF" "$SOURCE" "$REPO_NAME" --groups "$SKILL_GROUPS"

echo "▸ CI workflow"
mkdir -p .github/workflows
[ -f .github/workflows/agentbase-check.yml ] || cp "${ROOT}templates/consumer/consumer-ci.yml" .github/workflows/agentbase-check.yml

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
gh repo edit "$OWNER/$REPO_NAME" --add-topic agentbase-consumer 2>/dev/null \
  || echo "  add the GitHub topic 'agentbase-consumer' manually (gh could not edit $OWNER/$REPO_NAME)"

cat <<MSG

Done. Review and commit everything, generated files included:
  - agentbase.json          ← the content repo, its release and this repo's groups
  - .agentbase/             ← $SOURCE at $REF; never edit by hand
  - rulesync.jsonc, .github/workflows/agentbase-check.yml, generated agent folders
  - .rulesync/              ← this repo's own skills; delete any that $SOURCE now ships
Append to CODEOWNERS (use a team, e.g. @org/platform, for an organization):
MSG
sed "s#__ORG__#${SOURCE%%/*}#g" "${ROOT}templates/consumer/codeowners-snippet"
