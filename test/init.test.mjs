import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { lintGroups } from '../scripts/lint-groups.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'agentspread.mjs');
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
// No gh remote in a temp dir, so init falls back to the placeholder owner and the folder name.
const init = (cwd, ...args) => spawnSync('node', [CLI, 'init', ...args], { cwd, encoding: 'utf8', env: { ...process.env, GH_TOKEN: '' } });

test('init scaffolds a content repo pinned to this version', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentspread-init-'));
  const run = init(dir);
  assert.equal(run.status, 0, run.stderr);
  for (const file of ['.gitignore', 'README.md', 'package.json', '.github/dependabot.yml', 'groups/common/skills/example-skill/SKILL.md']) {
    assert.ok(existsSync(join(dir, file)), file);
  }
  const release = readFileSync(join(dir, '.github/workflows/agentspread-release.yml'), 'utf8');
  assert.match(release, new RegExp(`uses: sulhadin/agentspread/\\.github/workflows/release\\.yml@v${version.replaceAll('.', '\\.')}`));
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  assert.equal(pkg.devDependencies.agentspread, version);
  assert.doesNotMatch(readFileSync(join(dir, 'README.md'), 'utf8'), /__[A-Z]+__/);
  assert.deepEqual(lintGroups(dir).errors, []);
});

test('init refuses an existing content repo and merges into an existing package.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentspread-init-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'mine', scripts: { lint: 'eslint .' } }));
  assert.equal(init(dir).status, 0);
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'mine');
  assert.equal(pkg.scripts.lint, 'eslint .', 'existing scripts win');
  assert.equal(pkg.scripts.onboard, 'agentspread onboard');
  assert.equal(pkg.scripts.reconfigure, 'agentspread reconfigure');
  const again = init(dir);
  assert.notEqual(again.status, 0);
  assert.match(again.stderr, /looks like a content repo already/);
});

test('init --delivery pull records it and leaves out the App-only sync workflow', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentspread-init-'));
  const run = init(dir, '--delivery', 'pull');
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).agentspread.delivery, 'pull');
  assert.equal(existsSync(join(dir, '.github/workflows/agentspread-sync.yml')), false);
  assert.ok(existsSync(join(dir, '.github/workflows/agentspread-release.yml')));
  assert.doesNotMatch(run.stdout, /GitHub App/);

  const app = mkdtempSync(join(tmpdir(), 'agentspread-init-'));
  assert.equal(init(app).status, 0, 'app is the default without a TTY');
  assert.equal(JSON.parse(readFileSync(join(app, 'package.json'), 'utf8')).agentspread, undefined);
  assert.ok(existsSync(join(app, '.github/workflows/agentspread-sync.yml')));
  assert.match(init(mkdtempSync(join(tmpdir(), 'agentspread-init-')), '--delivery', 'push').stderr, /--delivery is app or pull/);
});

test('init --delivery pull stops before writing anything when the content repo is private', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentspread-init-'));
  const bin = mkdtempSync(join(tmpdir(), 'agentspread-bin-'));
  writeFileSync(join(bin, 'gh'), `#!/bin/sh\ncase "$*" in *isPrivate*) echo true ;; *) echo acme/private-config ;; esac\n`);
  chmodSync(join(bin, 'gh'), 0o755);
  const run = spawnSync('node', [CLI, 'init', '--delivery', 'pull'], { cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /works only with a public content repo/);
  assert.match(run.stderr, /npx agentspread init --delivery app/);
  assert.doesNotMatch(run.stderr, /make it public/);
  assert.deepEqual(readdirSync(dir), []);
});

test('init keeps files the repo already has, and says so', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentspread-init-'));
  mkdirSync(join(dir, '.github'), { recursive: true });
  writeFileSync(join(dir, '.github/dependabot.yml'), 'version: 2\nupdates: []\n');
  const run = init(dir);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(readFileSync(join(dir, '.github/dependabot.yml'), 'utf8'), 'version: 2\nupdates: []\n');
  assert.match(run.stdout, /Kept as they were[\s\S]*\.github\/dependabot\.yml/);
});
