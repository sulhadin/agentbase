#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// Where each command runs, and what it is for.
const COMMANDS = {
  init: ['node', 'scripts/init.mjs', 'create a content repo in the current directory'],
  setup: ['node', 'scripts/setup.mjs', 'onboard consumer repos or reconfigure one (run in the content repo)'],
  onboard: ['bash', 'scripts/onboard.sh', 'onboard consumer repos without prompts (run in the content repo)'],
  reconfigure: ['bash', 'scripts/reconfigure.sh', "change a consumer's groups or agents (run in the content repo)"],
  adopt: ['bash', 'scripts/adopt.sh', 'adopt the current repo as a consumer of a content repo'],
  lint: ['node', 'scripts/lint-groups.mjs', 'check groups/ in a content repo'],
  apply: ['node', 'scripts/sync-consumer.mjs', 'internal: used by adopt and the sync workflow', ['apply']],
  summary: ['node', 'scripts/sync-consumer.mjs', 'internal: used by the sync workflow', ['summary']],
};

const [command, ...args] = process.argv.slice(2);
if (command === '--version' || command === '-v') {
  console.log(version);
} else if (!COMMANDS[command]) {
  console.log(`agentspread ${version}\n\nUsage: npx agentspread <command>\n`);
  for (const [name, [, , about]] of Object.entries(COMMANDS)) console.log(`  ${name.padEnd(12)} ${about}`);
  process.exit(command && command !== '--help' && command !== '-h' ? 1 : 0);
} else {
  const [runner, script, , prefix = []] = COMMANDS[command];
  const run = spawnSync(runner, [`${root}${script}`, ...prefix, ...args], {
    stdio: 'inherit',
    env: { ...process.env, AGENTSPREAD_ROOT: root, AGENTSPREAD_VERSION: version },
  });
  process.exit(run.status ?? 1);
}
