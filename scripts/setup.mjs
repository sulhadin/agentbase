import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkbox, confirm, select } from '@inquirer/prompts';
import { fetchTree } from './sync-consumer.mjs';

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: npx agentspread setup\n\nRun in the content repo: onboard consumer repos or reconfigure an adopted one, interactively.');
  process.exit(0);
}

// Cursor, Copilot and OpenCode read .agents/skills too, so a copy in their own folder would only
// make every skill appear twice.
const AGENTS = [
  { name: 'Claude Code', target: 'claudecode', dir: '.claude/', checked: true },
  { name: 'Codex', target: 'codexcli', dir: '.agents/skills, .codex/', checked: true },
  { name: 'Cursor', target: 'codexcli', dir: '.agents/skills' },
  { name: 'Antigravity', target: 'codexcli', dir: '.agents/skills' },
  { name: 'GitHub Copilot', target: 'codexcli', dir: '.agents/skills' },
  { name: 'OpenCode', target: 'codexcli', dir: '.agents/skills' },
  { name: 'Cline', target: 'cline', dir: '.cline/skills' },
  { name: 'Roo Code', target: 'roo', dir: '.roo/skills' },
  { name: 'Kiro', target: 'kiro', dir: '.kiro/skills' },
  { name: 'Junie', target: 'junie', dir: '.junie/skills' },
  { name: 'Warp', target: 'warp', dir: '.warp/skills' },
  { name: 'Qwen Code', target: 'qwencode', dir: '.qwen/skills' },
  { name: 'Augment', target: 'augmentcode', dir: '.augment/skills' },
];

// Ctrl+C in a prompt rejects with ExitPromptError; exit quietly instead of printing its stack.
const ask = (prompt) =>
  prompt.catch((err) => {
    if (err?.name === 'ExitPromptError') process.exit(130);
    throw err;
  });

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' }).trim();
let source;
try {
  source = gh('repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner');
} catch {
  console.error('Run this inside the content repo (a GitHub checkout with groups/).');
  process.exit(1);
}
const [owner, contentRepo] = source.split('/');
const readFile = (repo, path) => {
  try {
    return Buffer.from(gh('api', `repos/${owner}/${repo}/contents/${path}`, '-q', '.content'), 'base64').toString('utf8');
  } catch {
    return null;
  }
};
const script = (name) => fileURLToPath(new URL(`./${name}`, import.meta.url));
const run = (file, args) => process.exit(spawnSync('bash', [file, ...args], { stdio: 'inherit' }).status ?? 1);

const pickAgents = (current) =>
  ask(checkbox({
    message: 'Agents to generate files for',
    pageSize: AGENTS.length,
    loop: false,
    required: true,
    choices: AGENTS.map((a, i) => ({
      name: `${a.name.padEnd(15)} ${a.dir}`,
      short: a.name,
      value: a,
      // Several agents share a target; only the first of them stands for it when prefilling.
      checked: current ? current.includes(a.target) && AGENTS.findIndex((b) => b.target === a.target) === i : a.checked,
    })),
  }));

const pickGroups = (available, { current = [], autoFor = [] }) => {
  const optional = available.filter((g) => g !== 'common');
  if (!optional.length) return [];
  return ask(checkbox({
    message: 'Groups (common is always included)',
    pageSize: 15,
    loop: false,
    choices: optional.map((g) => {
      const auto = autoFor.includes(g);
      return { name: g, short: g, value: g, checked: current.includes(g), disabled: auto && `(added to ${g} automatically)` };
    }),
  }));
};

const repos = JSON.parse(
  gh('repo', 'list', owner, '--limit', '1000', '--no-archived', '--json', 'name,isPrivate,repositoryTopics'),
).filter((r) => r.name !== contentRepo);
// The topic is added when the adoption PR opens, so it also marks repos whose PR was closed unmerged.
const tagged = repos.filter((r) => (r.repositoryTopics ?? []).some((t) => t.name === 'agentspread-consumer'));
const adopted = new Set(tagged.filter((r) => readFile(r.name, 'rulesync.jsonc') !== null).map((r) => r.name));

const mode = await ask(select({
  message: 'What do you want to do?',
  choices: [
    { name: 'Onboard new repos', value: 'onboard' },
    { name: "Reconfigure an adopted repo's groups and agents", value: 'reconfigure', disabled: !adopted.size && 'no adopted repos yet' },
  ],
}));

if (mode === 'reconfigure') {
  const repo = await ask(select({
    message: 'Repo to reconfigure',
    pageSize: 15,
    choices: [...adopted].sort().map((name) => ({ name, value: name })),
  }));
  const membership = readFile(repo, 'agentspread.json');
  if (!membership) {
    console.error(`${repo} has no agentspread.json yet; it gets one with its next agentspread sync.`);
    process.exit(1);
  }
  const { ref, groups: currentGroups, source: consumerSource } = JSON.parse(membership);
  const currentTargets = JSON.parse(readFile(repo, 'rulesync.jsonc').match(/"targets":\s*(\[[^\]]*\])/)?.[1] ?? '[]');
  // Groups as of the repo's own release: reconfiguring keeps that release rather than upgrading it.
  const { groups } = fetchTree(consumerSource, ref);

  const selectedAgents = await pickAgents(currentTargets);
  const selectedGroups = await pickGroups(groups, { current: currentGroups, autoFor: [repo] });
  const targets = [...new Set(selectedAgents.map((a) => a.target))];

  console.log(`
  Repo:        ${repo} (stays on ${consumerSource} ${ref})
  Groups now:  ${currentGroups.join(', ')}
  Groups new:  ${[...new Set(['common', ...selectedGroups, ...(groups.includes(repo) ? [repo] : [])])].join(', ')}
  Agents now:  ${currentTargets.join(', ')}
  Agents new:  ${targets.join(', ')}
  Opens or updates a PR on chore/agentspread-reconfigure.
`);
  if (!(await ask(confirm({ message: 'Open the PR?', default: true })))) process.exit(0);
  run(script('reconfigure.sh'), [repo, '--groups', selectedGroups.join(','), '--targets', targets.join(',')]);
} else {
  // Read from the latest release, since that is the ref adopt.sh pins and consumers actually fetch.
  let release;
  try {
    release = gh('release', 'view', '--json', 'tagName', '-q', '.tagName');
  } catch {
    console.error(`${source} has no release yet; run the release workflow from the Actions tab first.`);
    process.exit(1);
  }
  const selectedRepos = await ask(checkbox({
    message: `Repos to feed from ${source}`,
    pageSize: 15,
    loop: false,
    required: true,
    choices: repos.map((r) => ({
      name: `${r.name}${r.isPrivate ? '  (private)' : ''}`,
      value: r.name,
      disabled: adopted.has(r.name) && 'already adopted',
    })),
  }));
  const selectedAgents = await pickAgents(null);

  const { groups } = fetchTree(source, release);
  if (!groups.includes('common')) {
    console.error(`${source} ${release} has no groups/common/; add it and cut a release before onboarding.`);
    process.exit(1);
  }
  const selectedGroups = await pickGroups(groups, { autoFor: selectedRepos });
  const targets = [...new Set(selectedAgents.map((a) => a.target))];
  const dirs = [...new Set(selectedAgents.map((a) => a.dir))];

  console.log(`
  Repos:   ${selectedRepos.join(', ')}
  Groups:  ${['common', ...selectedGroups].join(', ')} (+ a group named after each repo, if one exists)
  Writes:  ${dirs.join(', ')}
  Each repo gets a PR on chore/adopt-agentspread. The GitHub App needs access to
  these repos, or later release PRs will not reach them.
`);
  if (!(await ask(confirm({ message: 'Open the PRs?', default: true })))) process.exit(0);
  const groupFlags = selectedGroups.length ? ['--groups', selectedGroups.join(',')] : [];
  run(script('onboard.sh'), [...selectedRepos, '--targets', targets.join(','), ...groupFlags]);
}
