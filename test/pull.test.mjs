import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const PULL = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'pull.sh');
const write = (root, files) => {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
};

// The consumer's agentspread-update workflow runs pull.sh with the content repo checked out next to it.
const setup = () => {
  const root = mkdtempSync(join(tmpdir(), 'agentspread-pull-'));
  write(join(root, 'content'), {
    'groups/common/skills/shared/SKILL.md': '---\nname: shared\ndescription: d\n---\nbody\n',
    'groups/common/AGENTS.md': 'Common rule.\n',
  });
  const consumer = join(root, 'web');
  write(consumer, {
    'rulesync.jsonc': '{\n  "targets": ["claudecode"],\n  "features": ["skills"]\n}\n',
    'agentspread.json': '{ "source": "acme/c", "ref": "v1.0.0", "groups": ["common"] }\n',
  });
  execFileSync('git', ['init', '-q'], { cwd: consumer });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init', '--allow-empty'], { cwd: consumer });
  execFileSync('git', ['add', '-A'], { cwd: consumer });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'adopt'], { cwd: consumer });
  // Offline stand-ins: generation isn't under test here, and there are no release notes to fetch.
  const bin = join(root, 'bin');
  write(bin, { npx: '#!/bin/sh\nexit 0\n', gh: '#!/bin/sh\nexit 1\n' });
  chmodSync(join(bin, 'npx'), 0o755);
  chmodSync(join(bin, 'gh'), 0o755);
  return { root, consumer, bin };
};

const pull = ({ root, consumer, bin }, ref) => {
  const output = join(root, `output-${ref}`);
  writeFileSync(output, '');
  const run = spawnSync('bash', [PULL], {
    cwd: consumer,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, SOURCE: 'acme/c', REF: ref, GITHUB_OUTPUT: output, GITHUB_REPOSITORY: 'acme/web', GH_TOKEN: 'x' },
  });
  return { run, output: readFileSync(output, 'utf8') };
};

test('pull.sh applies the release and writes the PR for the update workflow', () => {
  const env = setup();
  const { run, output } = pull(env, 'v1.1.0');
  assert.equal(run.status, 0, run.stderr);
  assert.match(output, /^open=true$/m);
  assert.match(output, /^title=chore\(agentspread\): update shared AI agent config to v1\.1\.0$/m);
  assert.match(output, /Bump `acme\/c` `v1\.0\.0` → `v1\.1\.0`/);
  assert.match(output, /skills: shared \(new\)/);
  assert.ok(existsSync(join(env.consumer, '.agentspread/skills/shared/SKILL.md')));
  assert.match(readFileSync(join(env.consumer, 'AGENTS.md'), 'utf8'), /Common rule\./);
});

test('pull.sh opens no PR when the repo is already on that release', () => {
  const env = setup();
  assert.equal(pull(env, 'v1.1.0').run.status, 0);
  execFileSync('git', ['add', '-A'], { cwd: env.consumer });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'pulled'], { cwd: env.consumer });
  const { run, output } = pull(env, 'v1.1.0');
  assert.equal(run.status, 0, run.stderr);
  assert.match(output, /^open=false$/m);
});
