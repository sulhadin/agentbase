import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { lintGroups } from '../scripts/lint-groups.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'agentbase.mjs');
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
// No gh remote in a temp dir, so init falls back to the placeholder owner and the folder name.
const init = (cwd, ...args) => spawnSync('node', [CLI, 'init', ...args], { cwd, encoding: 'utf8', env: { ...process.env, GH_TOKEN: '' } });

test('init scaffolds a content repo pinned to this version', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentbase-init-'));
  const run = init(dir);
  assert.equal(run.status, 0, run.stderr);
  for (const file of ['.gitignore', 'README.md', 'package.json', '.github/dependabot.yml', 'groups/common/skills/example-skill/SKILL.md']) {
    assert.ok(existsSync(join(dir, file)), file);
  }
  const release = readFileSync(join(dir, '.github/workflows/agentbase-release.yml'), 'utf8');
  assert.match(release, new RegExp(`uses: sulhadin/agentbase/\\.github/workflows/release\\.yml@v${version.replaceAll('.', '\\.')}`));
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  assert.equal(pkg.devDependencies.agentbase, version);
  assert.doesNotMatch(readFileSync(join(dir, 'README.md'), 'utf8'), /__[A-Z]+__/);
  assert.deepEqual(lintGroups(dir).errors, []);
});

test('init refuses an existing content repo and merges into an existing package.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentbase-init-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'mine', scripts: { lint: 'eslint .' } }));
  assert.equal(init(dir).status, 0);
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'mine');
  assert.equal(pkg.scripts.lint, 'eslint .', 'existing scripts win');
  assert.equal(pkg.scripts.setup, 'agentbase setup');
  const again = init(dir);
  assert.notEqual(again.status, 0);
  assert.match(again.stderr, /looks like a content repo already/);
});
