#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// Where each command runs, the arguments it always gets, and what it is for. onboard and reconfigure
// ask for their choices when called without arguments.
const INTERACTIVE = { runner: 'node', script: 'scripts/setup.mjs' };
const COMMANDS = {
  init: { runner: 'node', script: 'scripts/init.mjs', about: 'create a content repo in the current directory (--force overwrites)' },
  onboard: { runner: 'bash', script: 'scripts/onboard.sh', about: 'add consumer repos; asks which ones when called without any (run in the content repo)' },
  reconfigure: { runner: 'bash', script: 'scripts/reconfigure.sh', about: "change a consumer's groups or agents; asks when called without a repo (run in the content repo)" },
  adopt: { runner: 'bash', script: 'scripts/adopt.sh', about: 'adopt the current repo as a consumer of a content repo' },
  lint: { runner: 'node', script: 'scripts/lint-groups.mjs', about: 'check groups/ in a content repo' },
  instructions: {
    runner: 'node', script: 'scripts/sync-consumer.mjs', preset: ['instructions'],
    about: "rewrite agentspread's section in AGENTS.md and CLAUDE.md from .agentspread/ (run in a consumer repo)",
  },
};
// Kept for content repos whose package.json still runs `agentspread setup`: a menu of onboard and reconfigure.
const ALIASES = { setup: INTERACTIVE };

const [command, ...args] = process.argv.slice(2);
if (command === '--version' || command === '-v') {
  console.log(version);
} else if (!Object.hasOwn(COMMANDS, command ?? '') && !Object.hasOwn(ALIASES, command ?? '')) {
  console.log(`agentspread ${version}\n\nUsage: npx agentspread <command>\n`);
  for (const [name, { about }] of Object.entries(COMMANDS)) console.log(`  ${name.padEnd(13)} ${about}`);
  process.exit(command && command !== '--help' && command !== '-h' ? 1 : 0);
} else {
  const interactive = !args.length && (command === 'onboard' || command === 'reconfigure');
  const { runner, script, preset = [] } = interactive
    ? { ...INTERACTIVE, preset: [command] }
    : (ALIASES[command] ?? COMMANDS[command]);
  const run = spawnSync(runner, [`${root}${script}`, ...preset, ...args], {
    stdio: 'inherit',
    env: { ...process.env, AGENTSPREAD_ROOT: root, AGENTSPREAD_VERSION: version },
  });
  process.exit(run.status ?? 1);
}
