// Checks groups/ before anything reaches consumers. Errors fail CI; warnings flag what a reviewer
// must look at, because it runs code or widens permissions in every consumer.
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const GROUP_ENTRIES = new Set(['skills', 'subagents', 'commands', 'scripts', 'hooks.json', 'README.md']);
const listDir = (dir) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : []);

export function frontmatter(text) {
  const block = text.match(/^---\n([\s\S]*?)\n---/)?.[1];
  if (block === undefined) return null;
  return Object.fromEntries(
    block.split('\n').map((l) => l.match(/^([A-Za-z-]+):\s*(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]),
  );
}

function reviewFlags(text, fm) {
  const flags = [];
  if (fm['allowed-tools'] !== undefined) flags.push('allowed-tools pre-approves tools without prompting');
  if ('hooks' in fm) flags.push('frontmatter hooks run commands');
  if (fm.permissionMode !== undefined) flags.push(`permissionMode: ${fm.permissionMode}`);
  if (/^\s*!`|^```!/m.test(text)) flags.push('`!` lines run shell commands before the model sees the file');
  return flags;
}

export function lintGroups(root) {
  const errors = [];
  const warnings = [];
  const owners = new Map();
  const claim = (kind, name, where) => {
    const key = `${kind}/${name}`;
    if (owners.has(key)) errors.push(`${where}: ${kind} "${name}" is also defined in ${owners.get(key)}; names must be unique across groups`);
    else owners.set(key, where);
  };

  if (!existsSync(join(root, 'groups', 'common'))) errors.push('groups/common/ is required; every consumer gets it');

  for (const group of listDir(join(root, 'groups')).filter((e) => e.isDirectory()).map((e) => e.name)) {
    const dir = join('groups', group);
    // Group names become folder and script path names in every consumer, and hooks.json references them.
    if (!KEBAB.test(group)) errors.push(`${dir}: group names are lowercase kebab-case`);
    for (const entry of listDir(join(root, dir))) {
      if (!GROUP_ENTRIES.has(entry.name)) errors.push(`${dir}/${entry.name}: not read; a group holds ${[...GROUP_ENTRIES].join(', ')}`);
    }

    for (const skill of listDir(join(root, dir, 'skills'))) {
      const where = `${dir}/skills/${skill.name}`;
      if (!skill.isDirectory()) { errors.push(`${where}: a skill is a folder with SKILL.md`); continue; }
      const file = join(root, where, 'SKILL.md');
      if (!existsSync(file)) { errors.push(`${where}: has no SKILL.md`); continue; }
      const text = readFileSync(file, 'utf8');
      const fm = frontmatter(text);
      if (!fm) { errors.push(`${where}/SKILL.md: needs YAML frontmatter`); continue; }
      if (fm.name !== skill.name) errors.push(`${where}/SKILL.md: name "${fm.name}" must match its folder`);
      if (!KEBAB.test(skill.name)) errors.push(`${where}: skill names are lowercase kebab-case`);
      if (!fm.description) errors.push(`${where}/SKILL.md: needs a description`);
      else if (fm.description.length > 1024) errors.push(`${where}/SKILL.md: description is over 1024 characters`);
      // rulesync writes this flag for Claude and Cursor but not into .agents/skills, which Codex reads.
      if (/^true$/.test(fm['disable-model-invocation'] ?? '') && !/^codexcli:/m.test(text)) {
        warnings.push(`${where}/SKILL.md: disable-model-invocation has no codexcli policy, so Codex may still invoke it`);
      }
      for (const flag of reviewFlags(text, fm)) warnings.push(`${where}/SKILL.md: ${flag}`);
      claim('skill', skill.name, where);
    }

    for (const kind of ['subagents', 'commands']) {
      for (const file of listDir(join(root, dir, kind))) {
        const where = `${dir}/${kind}/${file.name}`;
        if (!file.isFile() || !file.name.endsWith('.md')) { errors.push(`${where}: expected <name>.md`); continue; }
        const text = readFileSync(join(root, where), 'utf8');
        const fm = frontmatter(text);
        if (!fm?.description) errors.push(`${where}: needs frontmatter with a description`);
        for (const flag of reviewFlags(text, fm ?? {})) warnings.push(`${where}: ${flag}`);
        claim(kind.slice(0, -1), file.name.replace(/\.md$/, ''), where);
      }
    }

    const hooksFile = join(root, dir, 'hooks.json');
    if (existsSync(hooksFile)) {
      let hooks;
      try {
        hooks = JSON.parse(readFileSync(hooksFile, 'utf8'));
      } catch (err) {
        errors.push(`${dir}/hooks.json: ${err.message}`);
      }
      if (hooks) {
        const events = hooks.hooks ?? {};
        for (const [event, entries] of Object.entries(events)) {
          if (!Array.isArray(entries)) errors.push(`${dir}/hooks.json: "${event}" must be an array`);
        }
        warnings.push(`${dir}/hooks.json: hooks run on every developer machine in every consumer of ${group}`);
        const text = JSON.stringify(hooks);
        for (const [, g, path] of text.matchAll(/\.agentspread\/scripts\/([^/"\s]+)\/([^"\s\\]+)/g)) {
          if (!existsSync(join(root, 'groups', g, 'scripts', path))) {
            errors.push(`${dir}/hooks.json: .agentspread/scripts/${g}/${path} does not exist as groups/${g}/scripts/${path}`);
          }
        }
      }
    }
  }
  return { errors, warnings };
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  if (['--help', '-h'].includes(process.argv[2])) {
    console.log('Usage: npx agentspread lint [content repo dir]\n\nChecks groups/ (default: the current directory).');
    process.exit(0);
  }
  const { errors, warnings } = lintGroups(process.argv[2] ?? process.cwd());
  const [warn, err] = process.env.GITHUB_ACTIONS ? ['::warning::', '::error::'] : ['warning: ', 'error: '];
  for (const w of warnings) console.log(`${warn}${w}`);
  for (const e of errors) console.log(`${err}${e}`);
  console.log(`${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(errors.length ? 1 : 0);
}
