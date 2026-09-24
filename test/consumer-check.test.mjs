import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts', 'sync-consumer.mjs');
// The consumer check runs inline in the workflow, so it is read from there to test what consumers run.
const workflow = readFileSync(join(ROOT, 'templates/consumer/consumer-ci.yml'), 'utf8');
const CHECK = workflow.match(/node -e '\n([\s\S]*?)\n {10}'/)[1].replace(/^ {12}/gm, '');

const write = (root, files) => {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
};
const content = (instructions) =>
  write(mkdtempSync(join(tmpdir(), 'agentspread-content-')), {
    'groups/common/skills/s/SKILL.md': '---\nname: s\ndescription: d\n---\nbody\n',
    ...(instructions ? { 'groups/common/AGENTS.md': instructions } : {}),
  });
const consumer = (setup = () => {}) => {
  const dir = write(mkdtempSync(join(tmpdir(), 'agentspread-consumer-')), {
    'rulesync.jsonc': '{\n  "targets": ["claudecode"],\n  "features": ["skills"]\n}\n',
  });
  setup(dir);
  return dir;
};
const apply = (dir, src) => spawnSync('node', [SCRIPT, 'apply', 'v1.0.0', 'acme/c', 'x', '--from', src], { cwd: dir, encoding: 'utf8' });
const check = (dir) => spawnSync('node', ['-e', CHECK], { cwd: dir, encoding: 'utf8' });
const heal = (dir) => spawnSync('node', [SCRIPT, 'instructions'], { cwd: dir, encoding: 'utf8' });

const setups = {
  'no CLAUDE.md': () => {},
  'its own CLAUDE.md': (d) => writeFileSync(join(d, 'CLAUDE.md'), '# Ours\n'),
  'CLAUDE.md linked to AGENTS.md': (d) => { writeFileSync(join(d, 'AGENTS.md'), '# Shared\n'); symlinkSync('AGENTS.md', join(d, 'CLAUDE.md')); },
  'CLAUDE.md importing AGENTS.md in a sentence': (d) => writeFileSync(join(d, 'CLAUDE.md'), 'Read @./AGENTS.md first.\n'),
};

for (const [name, setup] of Object.entries(setups)) {
  test(`the consumer check agrees with sync: ${name}`, () => {
    const dir = consumer(setup);
    assert.equal(apply(dir, content('Common rule.\n')).status, 0);
    assert.equal(check(dir).status, 0, check(dir).stdout);
    assert.equal(apply(dir, content(null)).status, 0);
    assert.equal(check(dir).status, 0, check(dir).stdout);
  });
}

test('the consumer check catches hand edits, and agentspread instructions repairs them', () => {
  const dir = consumer(setups['its own CLAUDE.md']);
  assert.equal(apply(dir, content('Common rule.\n')).status, 0);
  writeFileSync(join(dir, 'AGENTS.md'), readFileSync(join(dir, 'AGENTS.md'), 'utf8').replace('Common rule.', 'Edited.'));
  writeFileSync(join(dir, 'CLAUDE.md'), readFileSync(join(dir, 'CLAUDE.md'), 'utf8').replace(/\r?\n/g, '\r\n'));
  const failed = check(dir);
  assert.equal(failed.status, 1);
  assert.match(failed.stdout, /AGENTS\.md: the agentspread section is out of date/);
  assert.doesNotMatch(failed.stdout, /CLAUDE\.md/, 'CRLF alone is not an edit');
  assert.equal(heal(dir).status, 0);
  assert.equal(check(dir).status, 0);
});

test('a CLAUDE.md added after sync fails the check until agentspread instructions runs', () => {
  const dir = consumer();
  assert.equal(apply(dir, content('Common rule.\n')).status, 0);
  writeFileSync(join(dir, 'CLAUDE.md'), '# New\n');
  assert.match(check(dir).stdout, /CLAUDE\.md: the agentspread section is missing\. Run npx agentspread instructions/);
  assert.equal(heal(dir).status, 0);
  assert.equal(check(dir).status, 0);
  writeFileSync(join(dir, 'CLAUDE.md'), `@AGENTS.md\n${readFileSync(join(dir, 'CLAUDE.md'), 'utf8')}`);
  assert.match(check(dir).stdout, /CLAUDE\.md: the agentspread section is not expected here/);
  assert.equal(heal(dir).status, 0);
  assert.equal(readFileSync(join(dir, 'CLAUDE.md'), 'utf8'), '@AGENTS.md\n# New\n');
});
