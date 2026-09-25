import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const write = (root, files) => {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
};

// A consumer that was adopted before, re-running adopt as docs/keyless-delivery.md tells existing repos to.
test('re-running adopt keeps .rulesync/ out of it and adds the update workflow for keyless delivery', () => {
  const root = mkdtempSync(join(tmpdir(), 'agentspread-adopt-'));
  write(join(root, 'content'), { 'groups/common/skills/shared/SKILL.md': '---\nname: shared\ndescription: d\n---\nbody\n' });
  execFileSync('tar', ['-czf', join(root, 'content.tgz'), '-C', root, 'content']);
  const consumer = join(root, 'web');
  write(consumer, {
    'rulesync.jsonc': '{\n  "targets": ["claudecode"],\n  "features": ["skills"],\n  "inputRoots": [".agentspread", ".rulesync"]\n}\n',
    'agentspread.json': '{ "source": "acme/c", "ref": "v1.0.0", "groups": ["common"] }\n',
    '.claude/skills/shared/SKILL.md': '---\nname: shared\ndescription: d\n---\nbody\n',
  });
  execFileSync('git', ['init', '-q'], { cwd: consumer });

  const bin = join(root, 'bin');
  const pkg = Buffer.from(JSON.stringify({ agentspread: { delivery: 'pull' } })).toString('base64');
  write(bin, {
    npx: `#!/bin/sh\necho "$*" >> "${join(root, 'npx.log')}"\n`,
    gh: `#!/bin/sh
case "$*" in
  "release view"*) echo v1.1.0 ;;
  "repo view --json name"*) echo web ;;
  "repo view --json owner"*) echo acme ;;
  *"/contents/package.json"*) echo ${pkg} ;;
  *"/tarball/"*) cat "${join(root, 'content.tgz')}" ;;
  *) exit 0 ;;
esac
`,
  });
  chmodSync(join(bin, 'npx'), 0o755);
  chmodSync(join(bin, 'gh'), 0o755);

  const run = spawnSync('bash', [join(ROOT, 'scripts/adopt.sh'), 'acme/c'], {
    cwd: consumer,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, AGENTSPREAD_ROOT: `${ROOT}/` },
  });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /already adopted: keeping \.rulesync\/ as it is/);
  assert.doesNotMatch(readFileSync(join(root, 'npx.log'), 'utf8'), /import/);
  assert.equal(existsSync(join(consumer, '.rulesync')), false);
  const update = readFileSync(join(consumer, '.github/workflows/agentspread-update.yml'), 'utf8');
  assert.match(update, /repository: sulhadin\/agentspread/);
  assert.equal(JSON.parse(readFileSync(join(consumer, 'agentspread.json'), 'utf8')).ref, 'v1.1.0');
});
