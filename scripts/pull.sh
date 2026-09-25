#!/usr/bin/env bash
# Run by a consumer's agentspread-update workflow (keyless delivery), from the consumer checkout, with the
# content repo checked out at ../content and this engine at ../engine. Applies $SOURCE $REF, regenerates,
# and writes the PR's commit message, title and body to $GITHUB_OUTPUT, as sync.yml does for App delivery.
set -euo pipefail

: "${SOURCE:?}" "${REF:?}" "${GITHUB_OUTPUT:?}"
REPO="${GITHUB_REPOSITORY:-$(basename "$PWD")}"
REPO="${REPO#*/}"
ENGINE="$(cd "$(dirname "$0")/.." && pwd)"

old=$(node -e 'try { console.log(require("./agentspread.json").ref ?? "") } catch { console.log("") }')
node "$ENGINE/scripts/sync-consumer.mjs" apply "$REF" "$SOURCE" "$REPO" --from ../content

# No token here: generation reads only the checkout.
[ ! -f rulesync.lock ] || env -u GH_TOKEN npx --yes rulesync@16 install --frozen
env -u GH_TOKEN npx --yes rulesync@16 generate --delete

if [ -z "$(git status --porcelain)" ]; then
  echo "::notice::already up to date with $SOURCE $REF; no PR."
  echo "open=false" >> "$GITHUB_OUTPUT"
  exit 0
fi
changed=$(node "$ENGINE/scripts/sync-consumer.mjs" summary)
ignored=$(git ls-files --others --ignored --exclude-standard -- .agentspread AGENTS.md .claude .agents .codex .github \
  .cursor .opencode .cline .roo .kiro .junie .warp .qwen .augment | grep -v '\.local\.' | paste -sd' ' - || true)
[ -z "$ignored" ] || echo "::warning::.gitignore hides generated files: $ignored"

# Release notes are free text, so a fixed heredoc delimiter could end the output early.
eof="EOF_$(openssl rand -hex 8)"
{
  echo "open=true"
  echo "title=chore(agentspread): update shared AI agent config to $REF"
  echo "commit<<$eof"
  echo "chore(agentspread): update shared AI agent config to $REF"
  echo
  echo "Copy $SOURCE $REF (was ${old:-none}) into .agentspread/ and regenerate."
  echo
  echo "Changed: $changed"
  echo "$eof"
  echo "body<<$eof"
  echo "## Changelog"
  echo "- Bump \`$SOURCE\` \`${old:-none}\` → \`$REF\`"
  echo "- Changed: $changed"
  echo
  echo "## Description"
  echo "Pulled by the agentspread update workflow. \`.agentspread/\` and the generated agent files are rewritten on every update; do not edit them by hand. Checks don't run on PRs opened by a workflow's own token, so the files were regenerated in that run instead."
  echo
  if [ -n "$ignored" ]; then
    echo "## Before merge"
    echo "- \`.gitignore\` hides generated files, so this PR cannot commit them: $ignored. Fix \`.gitignore\` on the default branch."
    echo
  fi
  gh release view "$REF" --repo "$SOURCE" --json body -q .body 2>/dev/null || true
  echo "$eof"
} >> "$GITHUB_OUTPUT"
