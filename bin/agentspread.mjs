#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// Where each command runs, and what it is for. onboard and reconfigure ask for their choices when
// called without arguments.
const INTERACTIVE = 'scripts/setup.mjs';
const COMMANDS = {
  init: ['node', 'scripts/init.mjs', 'create a content repo in the current directory (--force overwrites)'],
  onboard: ['bash', 'scripts/onboard.sh', 'add consumer repos; asks which ones when called without any (run in the content repo)'],
  reconfigure: ['bash', 'scripts/reconfigure.sh', "change a consumer's groups or agents; asks when called without a repo (run in the content repo)"],
  adopt: ['bash', 'scripts/adopt.sh', 'adopt the current repo as a consumer of a content repo'],
  lint: ['node', 'scripts/lint-groups.mjs', 'check groups/ in a content repo'],
  instructions: ['node', 'scripts/sync-consumer.mjs', "rewrite agentspread's section in AGENTS.md and CLAUDE.md from .agentspread/ (run in a consumer repo)"],
};
// Kept for content repos whose package.json still runs `agentspread setup`: a menu of onboard and reconfigure.
const ALIASES = { setup: ['node', INTERACTIVE] };

const [command, ...args] = process.argv.slice(2);
if (command === '--version' || command === '-v') {
  console.log(version);
} else if (!Object.hasOwn(COMMANDS, command ?? '') && !Object.hasOwn(ALIASES, command ?? '')) {
  console.log(`agentspread ${version}\n\nUsage: npx agentspread <command>\n`);
  for (const [name, [, , about]] of Object.entries(COMMANDS)) console.log(`  ${name.padEnd(13)} ${about}`);
  process.exit(command && command !== '--help' && command !== '-h' ? 1 : 0);
} else {
  const interactive = !args.length && (command === 'onboard' || command === 'reconfigure');
  const [runner, script, preset] = interactive ? ['node', INTERACTIVE, [command]] : [...(ALIASES[command] ?? COMMANDS[command]).slice(0, 2), []];
  const run = spawnSync(runner, [`${root}${script}`, ...preset, ...args], {
    stdio: 'inherit',
    env: { ...process.env, AGENTSPREAD_ROOT: root, AGENTSPREAD_VERSION: version },
  });
  process.exit(run.status ?? 1);
}
