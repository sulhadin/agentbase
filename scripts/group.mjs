// Adds a group to the content repo in the current directory, with placeholder files for the parts
// chosen. Asks for everything when called without a name.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { checkbox, input, select } from '@inquirer/prompts';
import { lintGroups } from './lint-groups.mjs';

const USAGE = `Usage: npx agentspread group [<name>] [--parts skills,subagents,commands,instructions]

Run in the content repo. Without a name, it asks what the group is for, its name and its parts.`;
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PARTS = {
  skills: 'a skill',
  subagents: 'a subagent',
  commands: 'a slash command',
  instructions: 'AGENTS.md instructions',
};

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(USAGE);
  process.exit(0);
}
const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

let name;
let parts = null;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--parts' || arg.startsWith('--parts=')) {
    if (parts) fail('give --parts once, as a comma-separated list');
    const value = arg === '--parts' ? args[++i] : arg.slice('--parts='.length);
    parts = (value ?? '').split(',').map((p) => p.trim()).filter(Boolean);
    if (!parts.length) fail(`--parts needs at least one of ${Object.keys(PARTS).join(', ')}`);
  } else if (arg.startsWith('-')) {
    fail(`unknown option ${arg}\n\n${USAGE}`);
  } else if (name) {
    fail(`one group at a time; got ${name} and ${arg}`);
  } else {
    name = arg;
  }
}
if (!existsSync('groups')) {
  console.error('✗ run this in the content repo (the one with groups/)');
  process.exit(1);
}

// Ctrl+C in a prompt rejects with ExitPromptError; exit quietly instead of printing its stack.
const ask = (prompt) =>
  prompt.catch((err) => {
    if (err?.name === 'ExitPromptError') process.exit(130);
    throw err;
  });

const invalidName = (name) => {
  if (!KEBAB.test(name)) return 'use lowercase letters, digits and dashes, e.g. backend or mobile-app';
  if (existsSync(join('groups', name))) return `groups/${name} already exists`;
  return null;
};

// Adopted repos, to offer as "one repo" targets; empty when gh can't tell, and the name is typed instead.
const consumerRepos = () => {
  try {
    const owner = execFileSync('gh', ['repo', 'view', '--json', 'owner', '-q', '.owner.login'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const list = execFileSync('gh', ['repo', 'list', owner, '--topic', 'agentspread-consumer', '--no-archived', '--limit', '1000', '--json', 'name', '-q', '.[].name'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return list.split('\n').filter(Boolean).sort();
  } catch {
    return [];
  }
};

let forRepo = false;

if (name) {
  const problem = invalidName(name);
  if (problem) fail(problem);
  forRepo = consumerRepos().includes(name);
} else {
  const repos = consumerRepos();
  const kind = await ask(select({
    message: 'Who is this group for?',
    choices: [
      { name: 'Several repos: a category such as backend or web', value: 'category' },
      { name: "One repo only: named after it, and added to it automatically", value: 'repo' },
    ],
  }));
  forRepo = kind === 'repo';
  const available = repos.filter((r) => !existsSync(join('groups', r)));
  if (forRepo && available.some((r) => KEBAB.test(r))) {
    name = await ask(select({
      message: 'Which repo?',
      pageSize: 15,
      // A repo-named group must match the repo exactly, and group names are lowercase kebab-case.
      choices: [...available.filter((r) => KEBAB.test(r)), ...available.filter((r) => !KEBAB.test(r))]
        .map((r) => ({ name: r, value: r, disabled: !KEBAB.test(r) && '(not lowercase kebab-case, so no group of its own)' })),
    }));
  } else {
    name = await ask(input({
      message: forRepo ? 'Repo name' : 'Group name',
      validate: (value) => {
        const problem = invalidName(value.trim());
        if (problem) return problem;
        // A category named like a repo would attach itself to that repo on its own.
        if (!forRepo && repos.includes(value.trim())) return `${value.trim()} is a repo; choose "One repo only" for it, or another name`;
        return true;
      },
    })).then((value) => value.trim());
  }
}

if (!parts) {
  parts = args.length ? ['skills'] : await ask(checkbox({
    message: 'What should it start with? (placeholders you then fill in)',
    required: true,
    choices: Object.entries(PARTS).map(([value, label]) => ({ name: label, value, checked: value === 'skills' })),
  }));
}
const unknown = parts.filter((p) => !Object.hasOwn(PARTS, p));
if (unknown.length) fail(`unknown part: ${unknown.join(', ')} (choose from ${Object.keys(PARTS).join(', ')})`);

const example = `${name}-example`;
const files = {
  skills: [`skills/${example}/SKILL.md`, `---
name: ${example}
description: Placeholder for the ${name} group. Say what this skill covers and when the agent should use it.
---
The instructions for the agent go here, in Markdown. Keep \`name\` equal to the folder name.
`],
  subagents: [`subagents/${example}.md`, `---
name: ${example}
description: Placeholder for the ${name} group. Say what this subagent does and when to delegate to it.
claudecode:
  model: inherit
---
The subagent's system prompt goes here: its role, what it should do, and what it should report back.
`],
  commands: [`commands/${example}.md`, `---
description: Placeholder for the ${name} group. Say what this slash command does.
---
The prompt that runs when someone types /${example} goes here.
`],
  instructions: ['AGENTS.md', `Placeholder for the ${name} group: instructions every agent in its repos should follow.
`],
};

const created = [];
for (const part of parts) {
  const [path, text] = files[part];
  const file = join('groups', name, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  created.push(file);
}

const { errors } = lintGroups('.');
const mine = errors.filter((e) => e.includes(`groups/${name}`));
console.log(`\nCreated groups/${name}/:`);
for (const file of created) console.log(`  ${file}`);
if (mine.length) {
  console.log('\nThe lint reports:');
  for (const e of mine) console.log(`  ${e}`);
}
console.log(`
Next:
  1. Fill in the placeholders and rename the ${example} files; npm run lint checks them.
  2. Open a PR titled like "feat(groups): add ${name}" and squash-merge it.
  3. Run the release workflow from the Actions tab.
  ${forRepo
    ? `4. Nothing else: ${name} gets the group with that release.`
    : '4. Add the group to repos with npm run reconfigure (or npm run onboard for new repos).'}
`);
