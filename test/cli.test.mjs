import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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

test('instructions rewrites the section in the consumer it runs in', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentspread-cli-'));
  mkdirSync(join(dir, '.agentspread'));
  writeFileSync(join(dir, '.agentspread/instructions.md'), 'Shared rule.\n');
  const run = spawnSync('node', [CLI, 'instructions'], { cwd: dir, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(readFileSync(join(dir, 'AGENTS.md'), 'utf8'), /Shared rule\./);
});

const contentRepo = () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentspread-content-'));
  mkdirSync(join(dir, 'groups/common/skills/a'), { recursive: true });
  writeFileSync(join(dir, 'groups/common/skills/a/SKILL.md'), '---\nname: a\ndescription: d\n---\nbody\n');
  return dir;
};

test('group creates the chosen placeholder parts, and the result passes lint', () => {
  const dir = contentRepo();
  const run = spawnSync('node', [CLI, 'group', 'backend', '--parts', 'skills,subagents,commands,instructions'], { cwd: dir, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  for (const file of ['skills/backend-example/SKILL.md', 'subagents/backend-example.md', 'commands/backend-example.md', 'AGENTS.md']) {
    assert.ok(readFileSync(join(dir, 'groups/backend', file), 'utf8').length, file);
  }
  assert.doesNotMatch(run.stdout, /The lint reports/);
  assert.equal(cli('lint', dir).status, 0);
});

test('group refuses a taken or malformed name and an unknown part', () => {
  const dir = contentRepo();
  const inDir = (...args) => spawnSync('node', [CLI, 'group', ...args], { cwd: dir, encoding: 'utf8' });
  assert.match(inDir('common').stderr, /groups\/common already exists/);
  assert.match(inDir('Web_UI').stderr, /lowercase letters/);
  assert.match(inDir('web', '--parts', 'hooks').stderr, /unknown part: hooks/);
});
