#!/usr/bin/env bash
set -euo pipefail

USAGE='Adopt the current repo as a consumer of a content repo. Run from the consumer repo root:
  npx agentspread adopt <content owner/repo> [ref] [--targets claudecode,codexcli] [--groups backend,web]
ref defaults to the content repo'"'"'s latest release. Groups are folders under its groups/: common is
always included, and so is the group named after this repo when it exists. The choice is recorded in
agentspread.json.'

ROOT="${AGENTSPREAD_ROOT:-$(cd "$(dirname "$0")/.." && pwd)/}"
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

# An adopted repo's agent folders hold what agentspread generated; importing them would copy the shared
# content into .rulesync/, where it would shadow every later release.
if [ -f agentspread.json ]; then
  echo "▸ already adopted: keeping .rulesync/ as it is"
elif [ ! -d .rulesync ]; then
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

echo "▸ copying $SOURCE $REF into .agentspread/"
node "${ROOT}scripts/sync-consumer.mjs" apply "$REF" "$SOURCE" "$REPO_NAME" --groups "$SKILL_GROUPS"

echo "▸ CI workflow"
mkdir -p .github/workflows
[ -f .github/workflows/agentspread-check.yml ] || cp "${ROOT}templates/consumer/consumer-ci.yml" .github/workflows/agentspread-check.yml

# Read from the default branch, not $REF: switching delivery is usually a chore commit that cuts no release.
DELIVERY=$({ gh api "repos/$SOURCE/contents/package.json" -q .content 2>/dev/null || true; } | base64 --decode 2>/dev/null \
  | node -e 'let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => { try { console.log(JSON.parse(s).agentspread?.delivery ?? "app") } catch { console.log("app") } })')
if [ "$DELIVERY" = pull ]; then
  echo "▸ update workflow (keyless delivery: this repo pulls $SOURCE releases itself)"
  engine=$(node -e 'console.log(require(process.argv[1]).repository.url.match(/github\.com[/:]([^/]+\/[^/.]+)/)[1])' "${ROOT}package.json")
  sed "s#__ENGINE__#$engine#g" "${ROOT}templates/consumer/update.yml" > .github/workflows/agentspread-update.yml
  # The update workflow opens its PR with this repo's own token, which GitHub allows only with this setting on.
  if gh api -X PUT "repos/$OWNER/$REPO_NAME/actions/permissions/workflow" -F can_approve_pull_request_reviews=true >/dev/null 2>&1; then
    echo "  turned on \"Allow GitHub Actions to create and approve pull requests\""
  else
    UPDATE_NOTE="  - turn on Settings > Actions > General > \"Allow GitHub Actions to create and approve pull requests\" (gh could not)"
  fi
fi

echo "▸ generating agent files"
npx --yes rulesync@16 generate --delete

echo "▸ checking .gitignore does not hide generated files"
ignored=$(git ls-files --others --ignored --exclude-standard -- .agentspread AGENTS.md .claude .agents .codex .github \
  .cursor .opencode .cline .roo .kiro .junie .warp .qwen .augment | grep -v '\.local\.' || true)
if [ -n "$ignored" ]; then
  echo "✗ .gitignore hides these generated files, so they would never be committed:" >&2
  echo "$ignored" | sed 's/^/    /' >&2
  echo "  Un-ignore them (e.g. replace '.claude' with '.claude/*' plus '!.claude/skills/', '!.claude/agents/'," >&2
  echo "  '!.claude/commands/', '!.claude/settings.json') and re-run." >&2
  exit 1
fi

echo "▸ repo topic"
gh repo edit "$OWNER/$REPO_NAME" --add-topic agentspread-consumer 2>/dev/null \
  || echo "  add the GitHub topic 'agentspread-consumer' manually (gh could not edit $OWNER/$REPO_NAME)"

cat <<MSG

Done. Review and commit everything, generated files included:
  - agentspread.json          ← the content repo, its release and this repo's groups
  - .agentspread/             ← $SOURCE at $REF; never edit by hand
  - rulesync.jsonc, .github/workflows/agentspread-check.yml, generated agent folders
  - AGENTS.md, CLAUDE.md      ← agentspread's section between its markers (CLAUDE.md only if it existed); the rest is yours
  - .rulesync/                ← this repo's own skills, subagents and commands; delete any that $SOURCE now ships
$( [ "$DELIVERY" != pull ] || echo "  - .github/workflows/agentspread-update.yml ← run it from the Actions tab to pull a newer $SOURCE release")
${UPDATE_NOTE:-}
Append to CODEOWNERS (use a team, e.g. @org/platform, for an organization):
MSG
sed "s#__ORG__#${SOURCE%%/*}#g" "${ROOT}templates/consumer/codeowners-snippet"
