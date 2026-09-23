import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bumpRulesync, changedSkills, pinMarketplace } from '../scripts/sync-consumer.mjs';

const rulesync = (...sources) => `{
  "targets": ["claudecode"],
  "sources": [
    // Bumped automatically by agentbase's sync workflow. Do not edit by hand.
${sources.map((s, i) => `    ${s}${i < sources.length - 1 ? ',' : ''}`).join('\n')}
  ]
}`;
const parse = (text) => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const opts = { ref: 'v2.0.0', owner: 'acme', repo: 'web', groups: ['common', 'backend'] };

test('bumps the ref of every agentbase source and leaves others alone', () => {
  const before = rulesync(
    '{ "source": "acme/agentbase:skills/common", "ref": "v1.0.0", "skills": ["*"] }',
    '{ "source": "acme/agentbase:skills/backend", "ref": "v1.0.0", "skills": ["*"] }',
    '{ "source": "other/agentbase-fork", "ref": "v1.0.0", "skills": ["*"] }',
  );
  const { text, migrated, added } = bumpRulesync(before, opts);
  const refs = parse(text).sources.map((s) => s.ref);
  assert.deepEqual(refs, ['v2.0.0', 'v2.0.0', 'v1.0.0']);
  assert.equal(migrated, false);
  assert.equal(added, false);
});

test('moves a pre-groups source to skills/common once the ref has groups', () => {
  const before = rulesync('{ "source": "acme/agentbase", "ref": "v1.0.0", "rules": ["*"], "skills": ["*"] }');
  const { text, migrated } = bumpRulesync(before, opts);
  assert.equal(migrated, true);
  assert.deepEqual(parse(text).sources, [
    { source: 'acme/agentbase:skills/common', ref: 'v2.0.0', rules: ['*'], skills: ['*'] },
  ]);
});

test('keeps a pre-groups source as is while the ref still has the flat layout', () => {
  const before = rulesync('{ "source": "acme/agentbase", "ref": "v1.0.0", "skills": ["*"] }');
  const { text, migrated } = bumpRulesync(before, { ...opts, groups: ['coding-standards', 'web'] });
  assert.equal(migrated, false);
  assert.equal(parse(text).sources[0].source, 'acme/agentbase');
});

test('adds the group named after the repo, without duplicating rules', () => {
  const before = rulesync('{ "source": "acme/agentbase:skills/common", "ref": "v1.0.0", "rules": ["*"], "skills": ["*"] }');
  const { text, added } = bumpRulesync(before, { ...opts, groups: ['common', 'web'] });
  assert.equal(added, true);
  assert.deepEqual(parse(text).sources, [
    { source: 'acme/agentbase:skills/common', ref: 'v2.0.0', rules: ['*'], skills: ['*'] },
    { source: 'acme/agentbase:skills/web', ref: 'v2.0.0', skills: ['*'] },
  ]);
});

test('adds the repo group after a common entry that is not last', () => {
  const before = rulesync(
    '{ "source": "acme/agentbase:skills/common", "ref": "v1.0.0", "skills": ["*"] }',
    '{ "source": "acme/agentbase:skills/backend", "ref": "v1.0.0", "skills": ["*"] }',
  );
  const { text } = bumpRulesync(before, { ...opts, groups: ['common', 'backend', 'web'] });
  assert.deepEqual(
    parse(text).sources.map((s) => s.source),
    ['acme/agentbase:skills/common', 'acme/agentbase:skills/web', 'acme/agentbase:skills/backend'],
  );
});

test('does not add the repo group twice or when it does not exist', () => {
  const withGroup = rulesync(
    '{ "source": "acme/agentbase:skills/common", "ref": "v1.0.0", "skills": ["*"] }',
    '{ "source": "acme/agentbase:skills/web", "ref": "v1.0.0", "skills": ["*"] }',
  );
  assert.equal(bumpRulesync(withGroup, { ...opts, groups: ['common', 'web'] }).added, false);
  const without = rulesync('{ "source": "acme/agentbase:skills/common", "ref": "v1.0.0", "skills": ["*"] }');
  assert.equal(bumpRulesync(without, opts).added, false);
});

test('migrates and adds the repo group in the same run', () => {
  const before = rulesync('{ "source": "acme/agentbase", "ref": "v1.0.0", "skills": ["*"] }');
  const { text } = bumpRulesync(before, { ...opts, groups: ['common', 'web'] });
  assert.deepEqual(
    parse(text).sources.map((s) => s.source),
    ['acme/agentbase:skills/common', 'acme/agentbase:skills/web'],
  );
});

test('pins the agentbase marketplace ref, adding it when missing', () => {
  const settings = `{
  "extraKnownMarketplaces": {
    "agentbase": { "source": { "source": "github", "repo": "acme/agentbase" } },
    "other": { "source": { "source": "github", "repo": "x/tools", "ref": "stable" } }
  }
}`;
  const once = pinMarketplace(settings, 'v1.0.0');
  const twice = pinMarketplace(once, 'v2.0.0');
  const markets = JSON.parse(twice).extraKnownMarketplaces;
  assert.equal(markets.agentbase.source.ref, 'v2.0.0');
  assert.equal(markets.other.source.ref, 'stable');
});

test('reports new, changed and removed skills by name across sources', () => {
  const lock = (sources) => ({ sources });
  const before = lock({ 'acme/agentbase': { skills: { a: { integrity: '1' }, b: { integrity: '1' }, gone: { integrity: '1' } } } });
  const after = lock({
    'acme/agentbase:skills/common': { skills: { a: { integrity: '1' }, b: { integrity: '2' } } },
    'acme/agentbase:skills/web': { skills: { fresh: { integrity: '1' } } },
  });
  assert.deepEqual(changedSkills(before, after), ['b', 'fresh (new)', 'gone (removed)']);
  assert.deepEqual(changedSkills(after, after), []);
  assert.deepEqual(changedSkills({}, lock({ 'acme/agentbase': { skills: { a: {} } } })), ['a (new)']);
});
