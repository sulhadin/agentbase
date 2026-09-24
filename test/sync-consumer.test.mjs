import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  dropMarketplace, featuresFor, isDowngrade, mergeHooks, readMembership, resolveGroups, summarize,
  updateRulesyncConfig, vendorGroups,
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

const legacyConsumer = () =>
  write(tmp(), {
    'rulesync.jsonc': `{
  "targets": ["claudecode", "codexcli"],
  "features": ["skills"],
  "sources": [
    // Bumped automatically by agentbase's sync workflow. Do not edit by hand.
    { "source": "Acme/agentbase", "ref": "v0.3.0", "skills": ["*"] },
    { "source": "other/tools", "ref": "v1", "skills": ["x"] }
  ]
}
`,
    'rulesync.lock': '{}',
    '.claude/settings.json': {
      permissions: { allow: ['Bash(ls)'] },
      extraKnownMarketplaces: { agentbase: { source: { source: 'github', repo: 'acme/agentbase', ref: 'v0.3.0' } } },
      enabledPlugins: { 'agentbase@agentbase': true },
    },
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

test('updateRulesyncConfig drops agentbase sources, keeps others valid and adds inputRoots', () => {
  const text = readFileSync(join(legacyConsumer(), 'rulesync.jsonc'), 'utf8');
  const once = updateRulesyncConfig(text, { source: 'acme/agentbase', features: ['skills', 'subagents'] });
  const config = jsonc(once);
  assert.deepEqual(config.sources, [{ source: 'other/tools', ref: 'v1', skills: ['x'] }]);
  assert.deepEqual(config.features, ['skills', 'subagents']);
  assert.deepEqual(config.inputRoots, ['.agentspread', '.rulesync']);
  assert.equal(updateRulesyncConfig(once, { source: 'acme/agentbase', features: ['skills', 'subagents'] }), once);
});

test('updateRulesyncConfig handles a config without sources and refuses inline agentbase sources', () => {
  const plain = '{\n  "targets": ["claudecode"],\n  "features": ["skills"]\n}\n';
  assert.deepEqual(jsonc(updateRulesyncConfig(plain, { source: 'acme/agentbase', features: ['skills'] })).inputRoots, ['.agentspread', '.rulesync']);
  const inline = '{\n  "features": ["skills"],\n  "sources": [{ "source": "acme/agentbase", "ref": "v1" }]\n}\n';
  assert.throws(() => updateRulesyncConfig(inline, { source: 'acme/agentbase', features: ['skills'] }), /one entry per line/);
});

test('dropMarketplace removes only the agentbase marketplace and its plugins', () => {
  const settings = dropMarketplace({
    extraKnownMarketplaces: { agentbase: { source: { repo: 'Acme/agentbase' } }, other: { source: { repo: 'x/y' } } },
    enabledPlugins: { 'common@agentbase': true, 'lint@other': true },
  });
  assert.deepEqual(settings, { extraKnownMarketplaces: { other: { source: { repo: 'x/y' } } }, enabledPlugins: { 'lint@other': true } });
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

test('apply migrates a pre-.agentspread consumer end to end', () => {
  const consumer = legacyConsumer();
  const run = apply(consumer, 'v1.0.0', 'acme/agentbase', 'web', '--from', agentspreadFixture());
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(consumer, 'agentspread.json'), 'utf8')), {
    source: 'acme/agentbase', ref: 'v1.0.0', groups: ['common', 'web'],
  });
  assert.deepEqual(readdirSync(join(consumer, '.agentspread/skills')).sort(), ['shared', 'ui']);
  const config = jsonc(readFileSync(join(consumer, 'rulesync.jsonc'), 'utf8'));
  assert.deepEqual(config.sources.map((s) => s.source), ['other/tools']);
  assert.deepEqual(config.features, ['skills', 'subagents', 'hooks']);
  assert.equal(existsSync(join(consumer, 'rulesync.lock')), true, 'kept: other/tools still needs it');
  const settings = JSON.parse(readFileSync(join(consumer, '.claude/settings.json'), 'utf8'));
  assert.deepEqual(settings, { permissions: { allow: ['Bash(ls)'] } });
});

test('apply removes the lockfile and fetched copies once no source is left', () => {
  const consumer = write(tmp(), {
    'rulesync.jsonc': '{\n  "features": ["skills"],\n  "sources": [\n    { "source": "acme/agentbase", "ref": "v0.3.0" }\n  ]\n}\n',
    'rulesync.lock': '{}',
    '.rulesync/skills/.curated/dropped/SKILL.md': skill('dropped'),
    '.rulesync/skills/own/SKILL.md': skill('own'),
  });
  assert.equal(apply(consumer, 'v1.0.0', 'acme/agentbase', 'x', '--from', agentspreadFixture()).status, 0);
  assert.equal(existsSync(join(consumer, 'rulesync.lock')), false);
  assert.equal(existsSync(join(consumer, '.rulesync/skills/.curated')), false);
  assert.equal(existsSync(join(consumer, '.rulesync/skills/own/SKILL.md')), true);
});

test('apply refuses a downgrade unless forced', () => {
  const consumer = legacyConsumer();
  const src = agentspreadFixture();
  const run = apply(consumer, 'v0.2.0', 'acme/agentbase', 'x', '--from', src);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /refusing to go from v0.3.0 back to v0.2.0/);
  assert.equal(apply(consumer, 'v0.2.0', 'acme/agentbase', 'x', '--from', src, '--force').status, 0);
});

test('apply stops on a malformed agentspread.json', () => {
  const consumer = legacyConsumer();
  writeFileSync(join(consumer, 'agentspread.json'), '{ "groups": ["common", "backend",] }');
  const run = apply(consumer, 'v1.0.0', 'acme/agentbase', 'x', '--from', agentspreadFixture());
  assert.notEqual(run.status, 0);
  assert.equal(existsSync(join(consumer, '.agentspread')), false);
});

test('apply refuses to overwrite hooks a repo wrote by hand', () => {
  const consumer = write(tmp(), {
    'rulesync.jsonc': '{\n  "features": ["skills"]\n}\n',
    '.claude/settings.json': { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'mine' }] }] } },
  });
  const run = apply(consumer, 'v1.0.0', 'acme/agentbase', 'x', '--from', agentspreadFixture());
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /already has hooks/);
});

test('summary lists what changed in .agentspread for the PR', () => {
  const consumer = legacyConsumer();
  execFileSync('git', ['init', '-q'], { cwd: consumer });
  assert.equal(apply(consumer, 'v1.0.0', 'acme/agentbase', 'x', '--from', agentspreadFixture()).status, 0);
  const out = execFileSync('node', [SCRIPT, 'summary'], { cwd: consumer, encoding: 'utf8' }).trim();
  assert.equal(out, 'skills: shared (new); subagents: reviewer (new); hooks: hooks.json (new)');
});

test('apply --set-groups replaces the groups and --targets the agents', () => {
  const consumer = legacyConsumer();
  const src = agentspreadFixture();
  assert.equal(apply(consumer, 'v1.0.0', 'acme/agentbase', 'x', '--groups', 'backend,web', '--from', src).status, 0);
  assert.deepEqual(readdirSync(join(consumer, '.agentspread/skills')).sort(), ['api', 'shared', 'ui']);

  const run = apply(consumer, 'v1.0.0', 'acme/agentbase', 'x', '--set-groups', 'web', '--targets', 'claudecode', '--from', src);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(consumer, 'agentspread.json'), 'utf8')).groups, ['common', 'web']);
  assert.deepEqual(readdirSync(join(consumer, '.agentspread/skills')).sort(), ['shared', 'ui']);
  assert.equal(existsSync(join(consumer, '.agentspread/commands')), false, 'backend was the only group with commands');
  assert.deepEqual(jsonc(readFileSync(join(consumer, 'rulesync.jsonc'), 'utf8')).targets, ['claudecode']);
});

test('apply moves a consumer from <owner>/agentbase to a renamed content repo', () => {
  const consumer = legacyConsumer();
  const run = apply(consumer, 'v0.1.0', 'acme/agentbase-config', 'x', '--from', agentspreadFixture());
  assert.equal(run.status, 0, run.stderr);
  const membership = JSON.parse(readFileSync(join(consumer, 'agentspread.json'), 'utf8'));
  assert.equal(membership.source, 'acme/agentbase-config');
  assert.deepEqual(jsonc(readFileSync(join(consumer, 'rulesync.jsonc'), 'utf8')).sources.map((s) => s.source), ['other/tools']);
  const again = apply(consumer, 'v0.0.9', 'acme/agentbase-config', 'x', '--from', agentspreadFixture());
  assert.match(again.stderr, /refusing to go from v0.1.0 back to v0.0.9/);
});
