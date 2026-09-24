import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  featuresFor, isDowngrade, mergeHooks, readMembership, resolveGroups, summarize,
  updateRulesyncConfig, vendorGroups, writeManagedBlock,
} from '../scripts/sync-consumer.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'sync-consumer.mjs');
const tmp = () => mkdtempSync(join(tmpdir(), 'agentspread-test-'));
const write = (root, files) => {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), typeof content === 'string' ? content : JSON.stringify(content));
  }
  return root;
};
const jsonc = (text) => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const skill = (name) => `---\nname: ${name}\ndescription: d\n---\nbody\n`;

const agentspreadFixture = () =>
  write(tmp(), {
    'groups/common/skills/shared/SKILL.md': skill('shared'),
    'groups/common/subagents/reviewer.md': 'reviewer',
    'groups/common/hooks.json': { version: 1, hooks: { postToolUse: [{ matcher: 'Write', command: 'a' }] } },
    'groups/backend/skills/api/SKILL.md': skill('api'),
    'groups/backend/commands/migrate.md': 'migrate',
    'groups/backend/scripts/fmt.sh': 'echo fmt',
    'groups/backend/hooks.json': { version: 1, hooks: { postToolUse: [{ matcher: 'Edit', command: 'b' }] } },
    'groups/web/skills/ui/SKILL.md': skill('ui'),
  });

const CONTENT = 'acme/agentspread-config';

const consumer = (membership = { source: CONTENT, ref: 'v0.3.0', groups: ['common'] }) =>
  write(tmp(), {
    'rulesync.jsonc': '{\n  "targets": ["claudecode"],\n  "features": ["skills"]\n}\n',
    'agentspread.json': membership,
  });

const apply = (cwd, ...args) =>
  spawnSync('node', [SCRIPT, 'apply', ...args], { cwd, encoding: 'utf8' });

test('readMembership rejects malformed files instead of resetting the groups', () => {
  assert.deepEqual(readMembership('{"source":"a/b","ref":"v1.0.0","groups":["common","web"]}'), {
    source: 'a/b', ref: 'v1.0.0', groups: ['common', 'web'],
  });
  assert.throws(() => readMembership('{"groups":["common",]}'));
  assert.throws(() => readMembership('{"groups":"backend"}'), /array of group names/);
});

test('resolveGroups always includes common and the group named after the repo', () => {
  const available = ['backend', 'common', 'web', 'api'];
  assert.deepEqual(resolveGroups(null, { available, repo: 'api' }).groups, ['common', 'api']);
  assert.deepEqual(resolveGroups(['common', 'backend'], { available, repo: 'x' }).groups, ['common', 'backend']);
  assert.throws(() => resolveGroups(null, { available, repo: 'x', requested: ['nope'] }), /no such group: nope/);
  assert.deepEqual(resolveGroups(['common', 'gone'], { available, repo: 'x' }).dropped, ['gone']);
  assert.deepEqual(resolveGroups(['common', 'web', 'backend'], { available, repo: 'web' }).groups, ['common', 'backend', 'web']);
  assert.deepEqual(resolveGroups(['common', 'gone'], { available, repo: 'gone' }).dropped, ['gone']);
});

test('isDowngrade compares semver tags and ignores anything else', () => {
  assert.equal(isDowngrade('v1.4.0', 'v1.3.9'), true);
  assert.equal(isDowngrade('v1.4.0', 'v1.10.0'), false);
  assert.equal(isDowngrade('v1.4.0', 'v1.4.0'), false);
  assert.equal(isDowngrade(null, 'v1.0.0'), false);
  assert.equal(isDowngrade('main', 'v1.0.0'), false);
});

test('mergeHooks concatenates each event across groups', () => {
  const merged = mergeHooks([
    { group: 'a', data: { hooks: { postToolUse: [1], stop: [2] } } },
    { group: 'b', data: { hooks: { postToolUse: [3] } } },
  ]);
  assert.deepEqual(merged, { version: 1, hooks: { postToolUse: [1, 3], stop: [2] } });
  assert.throws(() => mergeHooks([{ group: 'a', data: { hooks: { stop: {} } } }]), /must be an array/);
});

test('vendorGroups copies every part of the chosen groups only', () => {
  const out = join(tmp(), '.agentspread');
  vendorGroups(agentspreadFixture(), ['common', 'backend'], out);
  assert.deepEqual(readdirSync(join(out, 'skills')).sort(), ['api', 'shared']);
  assert.deepEqual(readdirSync(join(out, 'subagents')), ['reviewer.md']);
  assert.deepEqual(readdirSync(join(out, 'commands')), ['migrate.md']);
  assert.equal(readFileSync(join(out, 'scripts/backend/fmt.sh'), 'utf8'), 'echo fmt');
  const hooks = JSON.parse(readFileSync(join(out, 'hooks.json'), 'utf8'));
  assert.deepEqual(hooks.hooks.postToolUse.map((h) => h.command), ['a', 'b']);
});

test('vendorGroups refuses a skill defined by two groups', () => {
  const src = write(tmp(), {
    'groups/common/skills/dup/SKILL.md': skill('dup'),
    'groups/web/skills/dup/SKILL.md': skill('dup'),
  });
  assert.throws(() => vendorGroups(src, ['common', 'web'], join(tmp(), 'v')), /skill "dup" is defined by both common and web/);
});

test('featuresFor turns on parts that exist and keeps unrelated features', () => {
  const root = write(tmp(), { 'subagents/a.md': 'a', 'hooks.json': '{}' });
  assert.deepEqual(featuresFor(['skills', 'rules', 'commands'], [root]), ['skills', 'rules', 'subagents', 'hooks']);
});

test('updateRulesyncConfig sets targets and features, adds inputRoots and keeps the rest', () => {
  const text = `{
  // the repo's own note
  "targets": ["claudecode"],
  "features": ["skills"],
  "sources": [
    { "source": "other/tools", "ref": "v1", "skills": ["x"] }
  ]
}
`;
  const once = updateRulesyncConfig(text, { features: ['skills', 'subagents'], targets: ['claudecode', 'codexcli'] });
  const config = jsonc(once);
  assert.deepEqual(config.targets, ['claudecode', 'codexcli']);
  assert.deepEqual(config.features, ['skills', 'subagents']);
  assert.deepEqual(config.inputRoots, ['.agentspread', '.rulesync']);
  assert.deepEqual(config.sources, [{ source: 'other/tools', ref: 'v1', skills: ['x'] }]);
  assert.match(once, /the repo's own note/);
  assert.equal(updateRulesyncConfig(once, { features: ['skills', 'subagents'] }), once);
});

test('summarize groups the vendored changes by kind', () => {
  const nameStatus = [
    'A\t.agentspread/skills/new-one/SKILL.md',
    'M\t.agentspread/skills/api/SKILL.md',
    'A\t.agentspread/skills/api/extra.md',
    'D\t.agentspread/subagents/old.md',
    'M\t.agentspread/hooks.json',
  ].join('\n');
  assert.equal(summarize(nameStatus), 'skills: api, new-one (new); subagents: old (removed); hooks: hooks.json');
  assert.equal(summarize(''), 'none');
});

test('apply refuses a downgrade unless forced', () => {
  const repo = consumer();
  const src = agentspreadFixture();
  const run = apply(repo, 'v0.2.0', CONTENT, 'x', '--from', src);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /refusing to go from v0.3.0 back to v0.2.0/);
  assert.equal(apply(repo, 'v0.2.0', CONTENT, 'x', '--from', src, '--force').status, 0);
});

test('apply stops on a malformed agentspread.json', () => {
  const repo = consumer();
  writeFileSync(join(repo, 'agentspread.json'), '{ "groups": ["common", "backend",] }');
  const run = apply(repo, 'v1.0.0', CONTENT, 'x', '--from', agentspreadFixture());
  assert.notEqual(run.status, 0);
  assert.equal(existsSync(join(repo, '.agentspread')), false);
});

test('apply refuses to overwrite hooks a repo wrote by hand', () => {
  const consumer = write(tmp(), {
    'rulesync.jsonc': '{\n  "features": ["skills"]\n}\n',
    '.claude/settings.json': { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'mine' }] }] } },
  });
  const run = apply(consumer, 'v1.0.0', CONTENT, 'x', '--from', agentspreadFixture());
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /already has hooks/);
});

test('summary lists what changed in .agentspread for the PR', () => {
  const repo = consumer();
  execFileSync('git', ['init', '-q'], { cwd: repo });
  assert.equal(apply(repo, 'v1.0.0', CONTENT, 'x', '--from', agentspreadFixture()).status, 0);
  const out = execFileSync('node', [SCRIPT, 'summary'], { cwd: repo, encoding: 'utf8' }).trim();
  assert.equal(out, 'skills: shared (new); subagents: reviewer (new); hooks: hooks.json (new)');
});

test('apply --set-groups replaces the groups and --targets the agents', () => {
  const repo = consumer();
  const src = agentspreadFixture();
  assert.equal(apply(repo, 'v1.0.0', CONTENT, 'x', '--groups', 'backend,web', '--targets', 'claudecode,codexcli', '--from', src).status, 0);
  assert.deepEqual(readdirSync(join(repo, '.agentspread/skills')).sort(), ['api', 'shared', 'ui']);

  const run = apply(repo, 'v1.0.0', CONTENT, 'x', '--set-groups', 'web', '--targets', 'claudecode', '--from', src);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(repo, 'agentspread.json'), 'utf8')).groups, ['common', 'web']);
  assert.deepEqual(readdirSync(join(repo, '.agentspread/skills')).sort(), ['shared', 'ui']);
  assert.equal(existsSync(join(repo, '.agentspread/commands')), false, 'backend was the only group with commands');
  assert.deepEqual(jsonc(readFileSync(join(repo, 'rulesync.jsonc'), 'utf8')).targets, ['claudecode']);
});


test('writeManagedBlock adds, replaces and removes only its own section', () => {
  const block = (body) => `<!-- agentspread:start (managed by agentspread; edits inside are overwritten on the next sync) -->\n${body}\n<!-- agentspread:end -->`;
  assert.equal(writeManagedBlock('', 'shared'), `${block('shared')}\n`);
  const own = '# Repo\n\nOur own rules.\n';
  const added = writeManagedBlock(own, 'shared');
  assert.equal(added, `# Repo\n\nOur own rules.\n\n${block('shared')}\n`);
  const edited = added.replace('Our own rules.', 'Our own rules, edited.') + '\nMore of ours.\n';
  assert.equal(writeManagedBlock(edited, 'new'), `# Repo\n\nOur own rules, edited.\n\n${block('new')}\n\nMore of ours.\n`);
  assert.equal(writeManagedBlock(added, null), own);
  assert.equal(writeManagedBlock(`${block('shared')}\n`, null), '');
  assert.equal(writeManagedBlock(own, null), own);
  assert.throws(() => writeManagedBlock(`${own}<!-- agentspread:start -->\nleft open\n`, 'x'), /broken agentspread markers/);
  assert.throws(() => writeManagedBlock(`${block('a')}\n${block('b')}\n`, 'x'), /broken agentspread markers/);
});

const instructionsFixture = () =>
  write(tmp(), {
    'groups/common/skills/shared/SKILL.md': skill('shared'),
    'groups/common/AGENTS.md': 'Common rule.\n',
    'groups/web/AGENTS.md': 'Web rule.\n',
  });

test('apply writes the groups\' AGENTS.md into a section of the repo\'s AGENTS.md, keeping the rest', () => {
  const repo = consumer();
  writeFileSync(join(repo, 'AGENTS.md'), '# Ours\n');
  writeFileSync(join(repo, 'CLAUDE.md'), '# Claude notes\n');
  const src = instructionsFixture();
  assert.equal(apply(repo, 'v1.0.0', CONTENT, 'web', '--from', src).status, 0);
  assert.match(
    readFileSync(join(repo, 'AGENTS.md'), 'utf8'),
    /^# Ours\n\n<!-- agentspread:start[^\n]*-->\nCommon rule\.\n\nWeb rule\.\n<!-- agentspread:end -->\n$/,
  );
  assert.equal(
    readFileSync(join(repo, 'CLAUDE.md'), 'utf8'),
    readFileSync(join(repo, 'AGENTS.md'), 'utf8').replace('# Ours', '# Claude notes'),
    'Claude Code reads only CLAUDE.md when a repo has one',
  );

  rmSync(join(src, 'groups/common/AGENTS.md'));
  rmSync(join(src, 'groups/web/AGENTS.md'));
  assert.equal(apply(repo, 'v1.0.0', CONTENT, 'web', '--from', src).status, 0);
  assert.equal(readFileSync(join(repo, 'AGENTS.md'), 'utf8'), '# Ours\n');
  assert.equal(readFileSync(join(repo, 'CLAUDE.md'), 'utf8'), '# Claude notes\n');
});

test('apply never creates CLAUDE.md, and skips one that links to or imports AGENTS.md', () => {
  const src = instructionsFixture();
  const none = consumer();
  assert.equal(apply(none, 'v1.0.0', CONTENT, 'x', '--from', src).status, 0);
  assert.equal(existsSync(join(none, 'CLAUDE.md')), false);

  const imports = consumer();
  writeFileSync(join(imports, 'CLAUDE.md'), '@AGENTS.md\n');
  assert.equal(apply(imports, 'v1.0.0', CONTENT, 'x', '--from', src).status, 0);
  assert.equal(readFileSync(join(imports, 'CLAUDE.md'), 'utf8'), '@AGENTS.md\n');

  const linked = consumer();
  writeFileSync(join(linked, 'AGENTS.md'), '# Shared file\n');
  symlinkSync('AGENTS.md', join(linked, 'CLAUDE.md'));
  assert.equal(apply(linked, 'v1.0.0', CONTENT, 'x', '--from', src).status, 0);
  assert.equal(readFileSync(join(linked, 'AGENTS.md'), 'utf8').match(/agentspread:start/g).length, 1);
});

test('apply creates AGENTS.md for shared instructions and removes it once they are gone', () => {
  const repo = consumer();
  const src = instructionsFixture();
  assert.equal(apply(repo, 'v1.0.0', CONTENT, 'x', '--from', src).status, 0);
  assert.match(readFileSync(join(repo, 'AGENTS.md'), 'utf8'), /^<!-- agentspread:start[^\n]*-->\nCommon rule\.\n<!-- agentspread:end -->\n$/);
  rmSync(join(src, 'groups/common/AGENTS.md'));
  assert.equal(apply(repo, 'v1.0.0', CONTENT, 'x', '--from', src).status, 0);
  assert.equal(existsSync(join(repo, 'AGENTS.md')), false);
});

test('apply refuses shared instructions when rulesync rules would overwrite them', () => {
  const repo = consumer();
  for (const feature of ['rules', '*']) {
    writeFileSync(join(repo, 'rulesync.jsonc'), `{\n  "targets": ["claudecode"],\n  "features": ["skills", "${feature}"]\n}\n`);
    const run = apply(repo, 'v1.0.0', CONTENT, 'web', '--from', instructionsFixture());
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /enables "rules"/);
  }
});
