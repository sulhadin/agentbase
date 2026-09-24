import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'agentspread.mjs');
const cli = (...args) => spawnSync('node', [CLI, ...args], { encoding: 'utf8' });

test('the CLI passes a command exactly the arguments it was given', () => {
  const root = mkdtempSync(join(tmpdir(), 'agentspread-cli-'));
  mkdirSync(join(root, 'groups/common/skills/a'), { recursive: true });
  writeFileSync(join(root, 'groups/common/skills/a/SKILL.md'), '---\nname: a\ndescription: d\n---\nbody\n');
  const run = cli('lint', root);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /0 error\(s\)/);
});

test('onboard and reconfigure with arguments run without prompts', () => {
  assert.match(cli('onboard', '--help').stdout, /npx agentspread onboard <repo>/);
  assert.match(cli('reconfigure', '--help').stdout, /npx agentspread reconfigure <repo>/);
});

test('an unknown command prints the usage instead of crashing', () => {
  const run = cli('toString');
  assert.equal(run.status, 1);
  assert.match(run.stdout, /Usage: npx agentspread <command>/);
});
