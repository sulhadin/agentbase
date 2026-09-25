// Reads `npm pack --dry-run --json` on stdin and fails if a file the CLI or init needs would not ship.
import { readFileSync } from 'node:fs';

const REQUIRED = [
  'bin/agentspread.mjs',
  'release.content.cjs',
  'scripts/init.mjs', 'scripts/setup.mjs', 'scripts/group.mjs', 'scripts/sync-consumer.mjs', 'scripts/lint-groups.mjs',
  'scripts/adopt.sh', 'scripts/onboard.sh', 'scripts/reconfigure.sh', 'scripts/pull.sh',
  'templates/consumer/rulesync.jsonc', 'templates/consumer/consumer-ci.yml', 'templates/consumer/update.yml', 'templates/consumer/codeowners-snippet',
  'templates/content/package.json', 'templates/content/gitignore', 'templates/content/README.md',
  'templates/content/.github/dependabot.yml',
  'templates/content/.github/workflows/agentspread-release.yml',
  'templates/content/.github/workflows/agentspread-sync.yml',
  'templates/content/.github/workflows/agentspread-check.yml',
  'templates/content/groups/common/skills/example-skill/SKILL.md',
  'templates/content/groups/common/subagents/example-subagent.md',
  'templates/content/groups/common/commands/example-command.md',
  'templates/content/groups/common/AGENTS.md',
];
const [pack] = JSON.parse(readFileSync(0, 'utf8'));
const shipped = new Set(pack.files.map((f) => f.path));
const missing = REQUIRED.filter((f) => !shipped.has(f));
const unwanted = [...shipped].filter((f) => /^(test|\.github)\//.test(f));
for (const f of missing) console.log(`::error::${f} would not be published`);
for (const f of unwanted) console.log(`::error::${f} should not be published`);
console.log(`${pack.name}@${pack.version}: ${shipped.size} files, ${missing.length} missing, ${unwanted.length} unwanted`);
process.exit(missing.length || unwanted.length ? 1 : 0);
