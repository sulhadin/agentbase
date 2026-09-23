import { execFileSync } from 'node:child_process';

const version = process.argv[2];
if (!version) throw new Error('usage: set-version.mjs <version>');

execFileSync('npm', ['version', version, '--no-git-tag-version', '--allow-same-version'], { stdio: 'inherit' });
// Each group plugin's plugin.json takes its version from package.json.
execFileSync('node', ['scripts/build-plugins.mjs'], { stdio: 'inherit' });
