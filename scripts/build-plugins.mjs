// Builds one Claude Code plugin per group that has subagents, commands or hooks
// (groups/<group>/ → plugins/<group>/) and lists them in .claude-plugin/marketplace.json.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PLUGIN_PARTS = ['subagents', 'commands', 'hooks.json'];
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

const groups = readdirSync('groups', { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
const pluginGroups = groups.filter((g) => PLUGIN_PARTS.some((part) => existsSync(join('groups', g, part))));
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));

if (existsSync('plugins')) {
  for (const dir of readdirSync('plugins')) {
    if (!pluginGroups.includes(dir)) rmSync(join('plugins', dir), { recursive: true, force: true });
  }
}

for (const group of pluginGroups) {
  const out = join('plugins', group);
  rmSync(out, { recursive: true, force: true });
  // rulesync refuses to write into a plugin output root that does not exist yet.
  mkdirSync(join(out, '.claude-plugin'), { recursive: true });
  execFileSync(
    'npx',
    [
      'rulesync', 'generate',
      '--targets', 'claudecode-plugin',
      '--features', 'commands,subagents,hooks',
      '--input-roots', join('groups', group),
      '--output-roots', out,
      '--silent',
    ],
    { stdio: 'inherit' },
  );
  writeJson(join(out, '.claude-plugin', 'plugin.json'), {
    name: group,
    description: `agentbase ${group} group: subagents, commands and hooks`,
    version,
  });
}

const marketplaceFile = join('.claude-plugin', 'marketplace.json');
const marketplace = JSON.parse(readFileSync(marketplaceFile, 'utf8'));
marketplace.plugins = pluginGroups.map((group) => ({
  name: group,
  source: `./plugins/${group}`,
  description: `agentbase ${group} group: subagents, commands and hooks`,
}));
writeJson(marketplaceFile, marketplace);

console.log(`plugins: ${pluginGroups.join(', ') || 'none'}`);
