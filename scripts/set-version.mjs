import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
if (!version) throw new Error('usage: set-version.mjs <version>');

execFileSync('npm', ['version', version, '--no-git-tag-version', '--allow-same-version'], { stdio: 'inherit' });

const pluginManifest = 'plugins/agentbase/.claude-plugin/plugin.json';
const plugin = JSON.parse(readFileSync(pluginManifest, 'utf8'));
plugin.version = version;
writeFileSync(pluginManifest, `${JSON.stringify(plugin, null, 2)}\n`);
