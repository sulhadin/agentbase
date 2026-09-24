import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { lintGroups } from '../scripts/lint-groups.mjs';

const repo = (files) => {
  const root = mkdtempSync(join(tmpdir(), 'agentspread-lint-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
};
const skill = (name, extra = '') => `---\nname: ${name}\ndescription: d\n${extra}---\nbody\n`;
const errorsOf = (files) => lintGroups(repo(files)).errors;

test('a well-formed repo passes', () => {
  const { errors, warnings } = lintGroups(repo({
    'groups/common/skills/a/SKILL.md': skill('a'),
    'groups/common/subagents/r.md': '---\nname: r\ndescription: d\n---\nx\n',
    'groups/backend/commands/m.md': '---\ndescription: d\n---\nx\n',
  }));
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});

test('common is required', () => {
  assert.match(errorsOf({ 'groups/web/skills/a/SKILL.md': skill('a') }).join(), /groups\/common\/ is required/);
});

test('names must be kebab-case, match their folder and be unique across groups', () => {
  const errors = errorsOf({
    'groups/common/skills/a/SKILL.md': skill('a'),
    'groups/web/skills/a/SKILL.md': skill('a'),
    'groups/web/skills/b/SKILL.md': skill('wrong'),
    'groups/Web_UI/skills/c/SKILL.md': skill('c'),
    'groups/common/commands/x.md': '---\ndescription: d\n---\n',
    'groups/web/commands/x.md': '---\ndescription: d\n---\n',
  }).join('\n');
  assert.match(errors, /skill "a" is also defined/);
  assert.match(errors, /command "x" is also defined/);
  assert.match(errors, /name "wrong" must match its folder/);
  assert.match(errors, /Web_UI: group names are lowercase kebab-case/);
});

test('typos in a group are reported instead of silently ignored', () => {
  assert.match(errorsOf({ 'groups/common/agents/r.md': 'x' }).join(), /groups\/common\/agents: not read/);
});

test('hooks must be valid and reference scripts that exist', () => {
  const errors = errorsOf({
    'groups/common/hooks.json': JSON.stringify({
      hooks: { postToolUse: [{ command: 'bash .agentspread/scripts/common/fmt.sh' }, { command: '.agentspread/scripts/common/missing.sh' }] },
    }),
    'groups/common/scripts/fmt.sh': 'echo',
  }).join('\n');
  assert.doesNotMatch(errors, /fmt\.sh/);
  assert.match(errors, /scripts\/common\/missing\.sh does not exist/);
  assert.match(errorsOf({ 'groups/common/hooks.json': '{ nope' }).join(), /hooks\.json/);
});

test('what runs code or widens permissions is flagged for review', () => {
  const { warnings } = lintGroups(repo({
    'groups/common/skills/a/SKILL.md': skill('a', 'allowed-tools: Bash\n'),
    'groups/common/skills/b/SKILL.md': `${skill('b')}\n!\`git status\`\n`,
    'groups/common/skills/c/SKILL.md': skill('c', 'disable-model-invocation: true\n'),
    'groups/common/hooks.json': '{ "hooks": {} }',
  }));
  const text = warnings.join('\n');
  assert.match(text, /a\/SKILL\.md: allowed-tools/);
  assert.match(text, /b\/SKILL\.md: `!` lines run shell commands/);
  assert.match(text, /c\/SKILL\.md: disable-model-invocation has no codexcli policy/);
  assert.match(text, /hooks\.json: hooks run on every developer machine/);
});

test('a group may carry AGENTS.md, but not the section markers', () => {
  const ok = { 'groups/common/skills/a/SKILL.md': skill('a'), 'groups/common/AGENTS.md': 'Be kind.\n' };
  assert.deepEqual(errorsOf(ok), []);
  const bad = { ...ok, 'groups/common/AGENTS.md': '<!-- agentspread:end -->\n' };
  assert.match(errorsOf(bad).join(), /must not start a line with an agentspread:start\/end marker/);
});
