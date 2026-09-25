// Scaffolds a content repo in the current directory: example groups, the workflows that call
// agentspread's reusable ones at this package's version, Dependabot for updates, and package.json.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { select } from '@inquirer/prompts';

const root = process.env.AGENTSPREAD_ROOT;
const version = process.env.AGENTSPREAD_VERSION;
if (!root || !version) throw new Error('run through the agentspread CLI: npx agentspread init');
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`Usage: npx agentspread init [--delivery app|pull] [--force]

Scaffolds a content repo in the current directory.
  --delivery app   releases open PRs in consumer repos through a GitHub App (default)
  --delivery pull  no App or key: each consumer repo pulls releases itself; the content repo must be public
  --force          overwrites files that already exist`);
  process.exit(0);
}
const force = process.argv.includes('--force');
const deliveryArg = process.argv.find((a) => a.startsWith('--delivery='))?.slice('--delivery='.length)
  ?? (process.argv.includes('--delivery') ? process.argv[process.argv.indexOf('--delivery') + 1] : undefined);
if (deliveryArg !== undefined && !['app', 'pull'].includes(deliveryArg)) {
  console.error('✗ --delivery is app or pull');
  process.exit(1);
}
const cwd = process.cwd();

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const engine = pkg.repository.url.match(/github\.com[/:]([^/]+\/[^/.]+)/)[1];
const tryRun = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};
const fullName = tryRun('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']);
const [owner, name] = fullName ? fullName.split('/') : ['your-org', basename(cwd)];

if (!force && existsSync(join(cwd, 'groups'))) {
  console.error('✗ groups/ already exists; this looks like a content repo already. Use --force to overwrite the scaffold.');
  process.exit(1);
}

const delivery = deliveryArg ?? (process.stdin.isTTY
  ? await select({
    message: 'How should releases reach your consumer repos?',
    choices: [
      { name: 'Through a GitHub App: a PR in every repo as soon as you release (you create the App once)', value: 'app' },
      { name: 'Without an App or key: each repo pulls a release when you run its update workflow (public content repo only)', value: 'pull' },
    ],
  }).catch((err) => {
    if (err?.name === 'ExitPromptError') process.exit(130);
    throw err;
  })
  : 'app');
// Consumers pull through their own token, which can read only public repos.
const isPrivate = delivery === 'pull' && tryRun('gh', ['repo', 'view', '--json', 'isPrivate', '-q', '.isPrivate']) === 'true';

const template = join(root, 'templates', 'content');
const fill = (text) =>
  text.replaceAll('__ENGINE__', engine).replaceAll('__VERSION__', version).replaceAll('__NAME__', name).replaceAll('__OWNER__', owner);
const written = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const src = join(dir, entry.name);
    if (entry.isDirectory()) { walk(src); continue; }
    // npm strips .gitignore files from published packages, so the template carries it without the dot.
    const rel = relative(template, src).replace(/^gitignore$/, '.gitignore');
    // With pull delivery nothing rolls out from here, so the manual sync workflow has nothing to do.
    if (delivery === 'pull' && rel === '.github/workflows/agentspread-sync.yml') continue;
    const dest = join(cwd, rel);
    if (rel === 'package.json' && existsSync(dest)) {
      const existing = JSON.parse(readFileSync(dest, 'utf8'));
      const ours = JSON.parse(fill(readFileSync(src, 'utf8')));
      existing.scripts = { ...ours.scripts, ...existing.scripts };
      existing.devDependencies = { ...existing.devDependencies, ...ours.devDependencies };
      writeFileSync(dest, `${JSON.stringify(existing, null, 2)}\n`);
    } else if (rel === '.gitignore' && existsSync(dest)) {
      const current = readFileSync(dest, 'utf8');
      if (!/^node_modules\/?$/m.test(current)) writeFileSync(dest, `${current.replace(/\n?$/, '\n')}node_modules/\n`);
    } else if (existsSync(dest) && rel === 'README.md' && !force) {
      continue;
    } else {
      cpSync(src, dest, { recursive: true });
      if (/\.(ya?ml|json|md)$/.test(rel) && statSync(dest).isFile()) writeFileSync(dest, fill(readFileSync(dest, 'utf8')));
    }
    written.push(rel);
  }
};
walk(template);
if (delivery === 'pull') {
  const file = join(cwd, 'package.json');
  const data = JSON.parse(readFileSync(file, 'utf8'));
  data.agentspread = { ...data.agentspread, delivery };
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

console.log(`agentspread ${version}: scaffolded ${owner}/${name}\n`);
if (!fullName) console.log(`  (not a GitHub checkout, so README.md says "${owner}"; edit it, or run init after gh repo create --clone)\n`);
for (const file of written.sort()) console.log(`  ${file}`);
if (delivery === 'app') {
  console.log(`
Next:
  1. Replace the placeholders in groups/common/ with your content, then commit with a feat: message
     and push to main.
  2. Create the GitHub App that opens the PRs (contents + pull requests: read & write), install it on
     ${owner}/${name} and every repo that will consume it:
       https://github.com/${engine}/blob/main/docs/github-app.md
  3. Create a "release" environment in ${owner}/${name} limited to main, holding the App's secrets:
       gh secret set AGENTSPREAD_APP_ID --env release --body <app id>
       gh secret set AGENTSPREAD_APP_PRIVATE_KEY --env release < <downloaded>.private-key.pem
  4. Run the release workflow from the Actions tab, for the first release.
  5. npm install && npm run onboard, to pick the repos that consume it.
`);
} else {
  if (isPrivate) console.log(`\n  ✗ ${owner}/${name} is private. Consumer repos can't read it without a key; make it public first.`);
  console.log(`
Next (delivery without an App or key):
  1. Replace the placeholders in groups/common/ with your content, then commit with a feat: message
     and push to main.
  2. Run the release workflow from the Actions tab, for the first release.
  3. npm install && npm run onboard, to pick the repos that consume it. Each gets an agentspread update
     workflow; run it there (Actions tab) whenever you want that repo on your latest release.
     How it works: https://github.com/${engine}/blob/main/docs/keyless-delivery.md
`);
}
