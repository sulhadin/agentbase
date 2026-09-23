import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changedSkills, parseTree, resolveGroups, writeSettings, writeSources } from '../scripts/sync-consumer.mjs';

const rulesync = (entries, features = '"skills"') => `{
  "targets": ["claudecode"],
  "features": [${features}],
  "sources": [
    // One entry per agentbase skill group.
${entries.map((e) => `    ${e}`).join('\n')}
  ]
}`;
const parse = (text) => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const sources = (text) => parse(text).sources.map((s) => s.source);
const at = { owner: 'acme', ref: 'v2.0.0' };

test('parseTree separates groups, groups with skills and groups with a plugin', () => {
  const tree = parseTree([
    'groups/common/skills/a/SKILL.md',
    'groups/backend/skills/b/SKILL.md',
    'groups/hooks-only/hooks.json',
    'plugins/common/.claude-plugin/plugin.json',
    'plugins/hooks-only/.claude-plugin/plugin.json',
    'README.md',
  ]);
  assert.deepEqual(tree, {
    groups: ['backend', 'common', 'hooks-only'],
    skillGroups: ['backend', 'common'],
    pluginGroups: ['common', 'hooks-only'],
  });
});

test('resolveGroups always includes common and the group named after the repo', () => {
  const available = ['backend', 'common', 'web', 'api'];
  assert.deepEqual(resolveGroups(null, { available, repo: 'api' }).groups, ['common', 'api']);
  assert.deepEqual(resolveGroups(['common', 'backend'], { available, repo: 'x' }).groups, ['common', 'backend']);
  assert.deepEqual(resolveGroups(null, { available, repo: 'x', requested: ['web'] }).groups, ['common', 'web']);
});

test('resolveGroups rejects unknown requested groups and drops removed ones', () => {
  assert.throws(() => resolveGroups(null, { available: ['common'], repo: 'x', requested: ['nope'] }), /no such group: nope/);
  const { groups, dropped } = resolveGroups(['common', 'gone'], { available: ['common'], repo: 'x' });
  assert.deepEqual(groups, ['common']);
  assert.deepEqual(dropped, ['gone']);
});

test('writeSources fills an empty sources array', () => {
  const text = writeSources(rulesync([]), { ...at, groups: ['common', 'backend'] });
  assert.deepEqual(parse(text).sources, [
    { source: 'acme/agentbase:groups/common/skills', ref: 'v2.0.0', skills: ['*'] },
    { source: 'acme/agentbase:groups/backend/skills', ref: 'v2.0.0', skills: ['*'] },
  ]);
});

test('writeSources replaces a pre-groups entry and keeps other sources in place', () => {
  const before = rulesync([
    '{ "source": "other/tools", "ref": "v9", "skills": ["x"] },',
    '{ "source": "acme/agentbase", "ref": "v1.0.0", "skills": ["*"] },',
    '{ "source": "more/tools", "ref": "v1", "skills": ["y"] }',
  ]);
  const text = writeSources(before, { ...at, groups: ['common', 'web'] });
  assert.deepEqual(sources(text), [
    'other/tools',
    'acme/agentbase:groups/common/skills',
    'acme/agentbase:groups/web/skills',
    'more/tools',
  ]);
  assert.deepEqual(parse(text).sources.map((s) => s.ref), ['v9', 'v2.0.0', 'v2.0.0', 'v1']);
});

test('writeSources selects rules once when the rules feature is on', () => {
  const text = writeSources(rulesync([], '"rules", "skills"'), { ...at, groups: ['common', 'web'] });
  assert.deepEqual(parse(text).sources.map((s) => s.rules), [['*'], undefined]);
});

test('writeSources removes every agentbase entry when no group has skills', () => {
  const before = rulesync(['{ "source": "acme/agentbase:groups/common/skills", "ref": "v1.0.0", "skills": ["*"] }']);
  assert.deepEqual(parse(writeSources(before, { ...at, groups: [] })).sources, []);
});

test('writeSources refuses multi-line entries rather than guessing', () => {
  const before = rulesync(['{', '  "source": "other/tools"', '}']);
  assert.throws(() => writeSources(before, { ...at, groups: ['common'] }), /one entry per line/);
});

test('writeSettings pins the marketplace and enables exactly the group plugins', () => {
  const before = JSON.stringify({
    extraKnownMarketplaces: {
      agentbase: { source: { source: 'github', repo: 'acme/agentbase' } },
      other: { source: { source: 'github', repo: 'x/tools', ref: 'stable' } },
    },
    enabledPlugins: { 'agentbase@agentbase': true, 'web@agentbase': false, 'lint@other': true },
    permissions: { allow: ['Bash(ls)'] },
  });
  const after = JSON.parse(writeSettings(before, { ...at, plugins: ['common', 'web'] }));
  assert.equal(after.extraKnownMarketplaces.agentbase.source.ref, 'v2.0.0');
  assert.equal(after.extraKnownMarketplaces.other.source.ref, 'stable');
  assert.deepEqual(after.enabledPlugins, { 'web@agentbase': false, 'lint@other': true, 'common@agentbase': true });
  assert.deepEqual(after.permissions, { allow: ['Bash(ls)'] });
});

test('writeSettings creates the marketplace entry when the file is empty', () => {
  const after = JSON.parse(writeSettings('', { ...at, plugins: ['common'] }));
  assert.deepEqual(after.extraKnownMarketplaces.agentbase.source, { source: 'github', repo: 'acme/agentbase', ref: 'v2.0.0' });
  assert.deepEqual(after.enabledPlugins, { 'common@agentbase': true });
});

test('changedSkills reports new, changed and removed skills by name across sources', () => {
  const lock = (sources) => ({ sources });
  const before = lock({ 'acme/agentbase': { skills: { a: { integrity: '1' }, b: { integrity: '1' }, gone: { integrity: '1' } } } });
  const after = lock({
    'acme/agentbase:groups/common/skills': { skills: { a: { integrity: '1' }, b: { integrity: '2' } } },
    'acme/agentbase:groups/web/skills': { skills: { fresh: { integrity: '1' } } },
  });
  assert.deepEqual(changedSkills(before, after), ['b', 'fresh (new)', 'gone (removed)']);
  assert.deepEqual(changedSkills(after, after), []);
  assert.deepEqual(changedSkills({}, lock({ 'acme/agentbase': { skills: { a: {} } } })), ['a (new)']);
});
