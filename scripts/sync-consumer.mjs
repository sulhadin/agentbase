// Keeps a consumer checkout in step with an agentbase release. Run from the consumer's root:
//   node sync-consumer.mjs apply <ref> <owner> <repo> [extra-groups-csv]
//   node sync-consumer.mjs changed <old-lock> <new-lock>
// agentbase.json records the repo's groups; rulesync.jsonc sources and the enabled Claude Code
// plugins are derived from it, because a group may have skills, a plugin, or both.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const MEMBERSHIP_FILE = 'agentbase.json';
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const unique = (xs) => [...new Set(xs)];

export function parseTree(paths) {
  const collect = (re) => unique(paths.map((p) => p.match(re)?.[1]).filter(Boolean)).sort();
  return {
    groups: collect(/^groups\/([^/]+)\//),
    skillGroups: collect(/^groups\/([^/]+)\/skills\/[^/]+\/SKILL\.md$/),
    pluginGroups: collect(/^plugins\/([^/]+)\/\.claude-plugin\/plugin\.json$/),
  };
}

export function resolveGroups(current, { available, repo, requested = [] }) {
  const unknown = requested.filter((g) => !available.includes(g));
  if (unknown.length) throw new Error(`no such group: ${unknown.join(', ')} (available: ${available.join(', ')})`);
  const wanted = unique(['common', ...(current ?? []), ...requested, ...(available.includes(repo) ? [repo] : [])]);
  return {
    groups: wanted.filter((g) => available.includes(g)),
    dropped: wanted.filter((g) => !available.includes(g)),
  };
}

// Rewrites only agentbase's entries; other sources stay as they are. Entries must be one per line.
export function writeSources(text, { owner, ref, groups }) {
  const lines = text.split('\n');
  const ours = new RegExp(`"source":\\s*"${escapeRegExp(owner)}/agentbase(?::[^"]*)?"`);
  const open = lines.findIndex((l) => /"sources":\s*\[/.test(l));
  if (open < 0) throw new Error('rulesync.jsonc has no "sources" array');
  const close = lines.findIndex((l, i) => i > open && /^\s*\]/.test(l));

  const isEntry = (l) => /^\s*\{/.test(l);
  const body = lines.slice(open + 1, close);
  if (body.some((l) => l.trim() && !l.trim().startsWith('//') && !(isEntry(l) && /\},?\s*$/.test(l)))) {
    throw new Error('rulesync.jsonc "sources" must hold one entry per line');
  }
  const existing = body.filter((l) => ours.test(l));
  const indent = (existing[0] ?? body.find(isEntry) ?? '    ').match(/^\s*/)[0] || '    ';
  const features = text.match(/"features":\s*\[([^\]]*)\]/)?.[1] ?? '';
  // rules live at the agentbase root, so only one entry selects them; repeating it would duplicate them.
  const withRules = /"rules"/.test(features);
  const fresh = groups.map(
    (g, i) =>
      `${indent}{ "source": "${owner}/agentbase:groups/${g}/skills", "ref": "${ref}", ${
        withRules && i === 0 ? '"rules": ["*"], ' : ''
      }"skills": ["*"] }`,
  );

  const firstOurs = body.findIndex((l) => ours.test(l));
  const kept = body.filter((l) => !ours.test(l));
  const at = firstOurs >= 0 ? firstOurs : kept.length;
  const merged = [...kept.slice(0, at), ...fresh, ...kept.slice(at)];
  const entries = merged.map((l, i) => (isEntry(l) ? i : -1)).filter((i) => i >= 0);
  const last = entries.at(-1);
  const normalized = merged.map((l, i) =>
    isEntry(l) ? l.replace(/\s*,?\s*$/, i === last ? '' : ',') : l,
  );
  return [...lines.slice(0, open + 1), ...normalized, ...lines.slice(close)].join('\n');
}

export function writeSettings(text, { owner, ref, plugins }) {
  const settings = text?.trim() ? JSON.parse(text) : {};
  settings.extraKnownMarketplaces ??= {};
  const market = (settings.extraKnownMarketplaces.agentbase ??= {
    source: { source: 'github', repo: `${owner}/agentbase` },
  });
  if (market.source?.repo?.endsWith('/agentbase')) market.source.ref = ref;

  settings.enabledPlugins ??= {};
  const wanted = plugins.map((p) => `${p}@agentbase`);
  for (const key of Object.keys(settings.enabledPlugins)) {
    if (key.endsWith('@agentbase') && !wanted.includes(key)) delete settings.enabledPlugins[key];
  }
  // An explicit false is someone opting out of that group's plugin, so it is kept.
  for (const key of wanted) if (!(key in settings.enabledPlugins)) settings.enabledPlugins[key] = true;
  return `${JSON.stringify(settings, null, 2)}\n`;
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
  return unique([...Object.keys(before), ...Object.keys(after)])
    .filter((name) => !(name in before) || !(name in after) || before[name] !== after[name])
    .sort()
    .map((name) => (!(name in before) ? `${name} (new)` : !(name in after) ? `${name} (removed)` : name));
}

export function fetchTree(owner, ref) {
  const out = execFileSync(
    'gh',
    ['api', `repos/${owner}/agentbase/git/trees/${encodeURIComponent(ref)}?recursive=1`, '-q', '.tree[].path'],
    { encoding: 'utf8' },
  );
  return parseTree(out.split('\n').filter(Boolean));
}

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
};

function apply(ref, owner, repo, requestedCsv = '') {
  const tree = fetchTree(owner, ref);
  if (!tree.groups.includes('common')) throw new Error(`agentbase ${ref} has no groups/common/`);

  const current = existsSync(MEMBERSHIP_FILE) ? readJson(MEMBERSHIP_FILE).groups : null;
  const { groups, dropped } = resolveGroups(current, {
    available: tree.groups,
    repo,
    requested: requestedCsv.split(',').filter(Boolean),
  });
  writeFileSync(MEMBERSHIP_FILE, `${JSON.stringify({ groups }, null, 2)}\n`);
  writeFileSync(
    'rulesync.jsonc',
    writeSources(readFileSync('rulesync.jsonc', 'utf8'), {
      owner,
      ref,
      groups: groups.filter((g) => tree.skillGroups.includes(g)),
    }),
  );
  if (existsSync('.claude/settings.json')) {
    writeFileSync(
      '.claude/settings.json',
      writeSettings(readFileSync('.claude/settings.json', 'utf8'), {
        owner,
        ref,
        plugins: groups.filter((g) => tree.pluginGroups.includes(g)),
      }),
    );
  }
  console.log(`groups: ${groups.join(', ')}`);
  if (dropped.length) console.log(`dropped groups no longer in agentbase ${ref}: ${dropped.join(', ')}`);
}

function main([command, ...args]) {
  try {
    if (command === 'apply') apply(...args);
    else if (command === 'changed') {
      console.log(changedSkills(readJson(args[0]), readJson(args[1])).join(', ') || 'none');
    } else throw new Error('usage: sync-consumer.mjs apply <ref> <owner> <repo> [groups] | changed <old-lock> <new-lock>');
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }
}

// Compared as real paths: under macOS's /var → /private/var symlink the two spellings differ.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2));
}
