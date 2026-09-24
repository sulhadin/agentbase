// Scaffolds a content repo in the current directory: example groups, the workflows that call
// agentspread's reusable ones at this package's version, Dependabot for updates, and package.json.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

const root = process.env.AGENTSPREAD_ROOT;
const version = process.env.AGENTSPREAD_VERSION;
if (!root || !version) throw new Error('run through the agentspread CLI: npx agentspread init');
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: npx agentspread init [--force]\n\nScaffolds a content repo in the current directory. --force overwrites files that already exist.');
  process.exit(0);
}
const force = process.argv.includes('--force');
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

console.log(`agentspread ${version}: scaffolded ${owner}/${name}\n`);
if (!fullName) console.log(`  (not a GitHub checkout, so README.md says "${owner}"; edit it, or run init after gh repo create --clone)\n`);
for (const file of written.sort()) console.log(`  ${file}`);
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
  4. Actions → release → Run workflow, for the first release.
  5. npm install && npm run setup, to pick the repos that consume it.
`);
