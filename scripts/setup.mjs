import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkbox, confirm } from '@inquirer/prompts';
import { fetchTree } from './sync-consumer.mjs';

// Several agents read the same folder, so they map to one rulesync target and one copy.
const AGENTS = [
  { name: 'Claude Code', target: 'claudecode', dir: '.claude/skills', checked: true },
  { name: 'Codex', target: 'codexcli', dir: '.agents/skills', checked: true },
  { name: 'Cursor', target: 'codexcli', dir: '.agents/skills' },
  { name: 'Antigravity', target: 'codexcli', dir: '.agents/skills' },
  { name: 'GitHub Copilot', target: 'copilot', dir: '.github/skills' },
  { name: 'OpenCode', target: 'opencode', dir: '.opencode/skills' },
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
const hasRulesyncConfig = (repo) => {
  try {
    execFileSync('gh', ['api', `repos/${owner}/${repo}/contents/rulesync.jsonc`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const owner = gh('repo', 'view', '--json', 'owner', '-q', '.owner.login');
const repos = JSON.parse(
  gh('repo', 'list', owner, '--limit', '500', '--no-archived', '--json', 'name,isPrivate,repositoryTopics'),
).filter((r) => r.name !== 'agentbase');

// The topic is added when the adoption PR opens, so it also marks repos whose PR was closed unmerged.
const adopted = new Set(
  repos
    .filter((r) => (r.repositoryTopics ?? []).some((t) => t.name === 'agentbase-consumer'))
    .filter((r) => hasRulesyncConfig(r.name))
    .map((r) => r.name),
);

const selectedRepos = await ask(checkbox({
  message: `Repos to adopt agentbase in (${owner})`,
  pageSize: 15,
  loop: false,
  required: true,
  choices: repos.map((r) => {
    return {
      name: `${r.name}${r.isPrivate ? '  (private)' : ''}`,
      value: r.name,
      disabled: adopted.has(r.name) && 'already adopted',
    };
  }),
}));

const selectedAgents = await ask(checkbox({
  message: 'Agents to generate skills for',
  pageSize: AGENTS.length,
  loop: false,
  required: true,
  choices: AGENTS.map((a) => ({ name: `${a.name.padEnd(15)} ${a.dir}`, short: a.name, value: a, checked: a.checked })),
}));

// Read from the latest release, since that is the ref adopt.sh pins and consumers actually fetch.
const release = gh('release', 'view', '--json', 'tagName', '-q', '.tagName');
const { groups } = fetchTree(owner, release);
if (!groups.includes('common')) {
  console.error(`agentbase ${release} has no groups/common/; release the grouped layout before onboarding.`);
  process.exit(1);
}
const optionalGroups = groups.filter((g) => g !== 'common');
const selectedGroups = optionalGroups.length
  ? await ask(checkbox({
      message: 'Groups (common is always included)',
      pageSize: 15,
      loop: false,
      choices: optionalGroups.map((g) => {
        const auto = selectedRepos.includes(g);
        return { name: auto ? `${g}  (added to ${g} automatically)` : g, short: g, value: g, disabled: auto && 'auto' };
      }),
    }))
  : [];

const targets = [...new Set(selectedAgents.map((a) => a.target))];
const dirs = [...new Set(selectedAgents.map((a) => a.dir))];

console.log(`
  Repos:   ${selectedRepos.join(', ')}
  Groups:  ${['common', ...selectedGroups].join(', ')} (+ a group named after each repo, if one exists)
  Writes:  ${dirs.join(', ')}
  Each repo gets a PR on chore/adopt-agentbase. The GitHub App needs access to
  these repos, or later release PRs will not reach them.
`);

if (!(await ask(confirm({ message: 'Open the PRs?', default: true })))) process.exit(0);

const onboard = fileURLToPath(new URL('./onboard.sh', import.meta.url));
const groupFlags = selectedGroups.length ? ['--groups', selectedGroups.join(',')] : [];
const run = spawnSync('bash', [onboard, ...selectedRepos, '--targets', targets.join(','), ...groupFlags], {
  stdio: 'inherit',
});
process.exit(run.status ?? 1);
