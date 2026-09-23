// Edits a consumer checkout during a sync rollout. Run from the consumer's root:
//   node sync-consumer.mjs bump <ref> <owner> <repo> <groups-at-ref-csv>
//   node sync-consumer.mjs changed <old-lock> <new-lock>
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function bumpRulesync(text, { ref, owner, repo, groups }) {
  const base = `${escapeRegExp(owner)}/agentbase`;
  const ours = new RegExp(`"source":\\s*"${base}(?::[^"]*)?"`);
  // Before groups existed, skill folders sat directly under skills/; reading that path at a grouped ref
  // would treat each group folder as one skill.
  const grouped = groups.includes('common');
  let migrated = false;

  const lines = text.split('\n').map((line) => {
    if (!ours.test(line)) return line;
    if (grouped) {
      const next = line.replace(new RegExp(`("source":\\s*"${base})"`), '$1:skills/common"');
      migrated ||= next !== line;
      line = next;
    }
    return line.replace(/("ref":\s*")[^"]*"/, `$1${ref}"`);
  });

  let added = false;
  const repoGroup = `/agentbase:skills/${repo}"`;
  if (grouped && repo !== 'common' && groups.includes(repo) && !lines.some((l) => l.includes(repoGroup))) {
    const common = lines.findIndex((l) => ours.test(l) && l.includes('/agentbase:skills/common"'));
    if (common >= 0) {
      const hadComma = /,\s*$/.test(lines[common]);
      // rules come from the repo root once, via the common entry; a second selection would duplicate them.
      const clone = lines[common]
        .replace('/agentbase:skills/common"', repoGroup)
        .replace(/"rules":\s*\[[^\]]*\],\s*/, '')
        .replace(/,\s*$/, '');
      if (!hadComma) lines[common] = lines[common].replace(/\s*$/, ',');
      lines.splice(common + 1, 0, clone + (hadComma ? ',' : ''));
      added = true;
    }
  }

  return { text: lines.join('\n'), migrated, added };
}

export function pinMarketplace(text, ref) {
  const marketplace = /"repo":\s*"[^"]*\/agentbase"/;
  return text
    .split('\n')
    .map((line) => {
      if (!marketplace.test(line)) return line;
      return /"ref":\s*"[^"]*"/.test(line)
        ? line.replace(/("ref":\s*")[^"]*"/, `$1${ref}"`)
        : line.replace(/("repo":\s*"[^"]*\/agentbase")/, `$1, "ref": "${ref}"`);
    })
    .join('\n');
}

// Keyed by skill name, so a skill that moved between sources (as in the move to groups) is unchanged.
const skillHashes = (lock) =>
  Object.fromEntries(
    Object.values(lock?.sources ?? {}).flatMap((s) =>
      Object.entries(s.skills ?? {}).map(([name, v]) => [name, v.integrity]),
    ),
  );

export function changedSkills(beforeLock, afterLock) {
  const before = skillHashes(beforeLock);
  const after = skillHashes(afterLock);
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((name) => !(name in before) || !(name in after) || before[name] !== after[name])
    .sort()
    .map((name) => (!(name in before) ? `${name} (new)` : !(name in after) ? `${name} (removed)` : name));
}

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
};

function main([command, ...args]) {
  if (command === 'bump') {
    const [ref, owner, repo, groupsCsv = ''] = args;
    const groups = groupsCsv.split(',').filter(Boolean);
    const result = bumpRulesync(readFileSync('rulesync.jsonc', 'utf8'), { ref, owner, repo, groups });
    writeFileSync('rulesync.jsonc', result.text);
    if (result.migrated) console.log('migrated the agentbase source to skills/common');
    if (result.added) console.log(`added the skills/${repo} group`);
    if (existsSync('.claude/settings.json')) {
      writeFileSync('.claude/settings.json', pinMarketplace(readFileSync('.claude/settings.json', 'utf8'), ref));
    }
  } else if (command === 'changed') {
    const [oldLock, newLock] = args;
    console.log(changedSkills(readJson(oldLock), readJson(newLock)).join(', ') || 'none');
  } else {
    console.error('usage: sync-consumer.mjs bump <ref> <owner> <repo> <groups> | changed <old-lock> <new-lock>');
    process.exit(2);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
