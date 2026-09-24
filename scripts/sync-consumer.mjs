// Keeps a consumer checkout in step with a release of its content repo (the repo holding groups/).
// Run from the consumer's root:
//   node sync-consumer.mjs apply <ref> <content owner/repo> <consumer repo> [--groups a,b | --set-groups a,b]
//                                [--targets a,b] [--from <content checkout>] [--force]
//   node sync-consumer.mjs summary
// The groups' content is copied into .agentspread/ (committed) and rulesync generates every agent's files
// from it plus the repo's own .rulesync/, so nothing is fetched at generate time and cloud agents see it all.
import { execFileSync } from 'node:child_process';
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MEMBERSHIP_FILE = 'agentspread.json';
export const VENDOR_DIR = '.agentspread';
export const INPUT_ROOTS = [VENDOR_DIR, '.rulesync'];
const PARTS = ['skills', 'subagents', 'commands', 'hooks'];
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const unique = (xs) => [...new Set(xs)];
const listDir = (dir) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : []);

export function parseTree(paths) {
  return { groups: unique(paths.map((p) => p.match(/^groups\/([^/]+)\//)?.[1]).filter(Boolean)).sort() };
}

export function readMembership(text) {
  const data = JSON.parse(text);
  const ok = Array.isArray(data.groups) && data.groups.every((g) => typeof g === 'string');
  if (!ok) throw new Error(`${MEMBERSHIP_FILE}: "groups" must be an array of group names`);
  const str = (v) => (typeof v === 'string' ? v : null);
  return { source: str(data.source), ref: str(data.ref), groups: data.groups };
}

// Before agentspread, a consumer's content always came from a repo named <owner>/agentbase.
const legacySource = (source) => `${source.split('/')[0]}/agentbase`;
const sourcePattern = (source) =>
  `(?:${escapeRegExp(source)}|${escapeRegExp(legacySource(source))})(?::[^"]*)?`;

export function resolveGroups(current, { available, repo, requested = [] }) {
  const unknown = requested.filter((g) => !available.includes(g));
  if (unknown.length) throw new Error(`no such group: ${unknown.join(', ')} (available: ${available.join(', ')})`);
  const wanted = unique(['common', ...(current ?? []), ...requested, ...(available.includes(repo) ? [repo] : [])]);
  return {
    groups: wanted.filter((g) => available.includes(g)),
    dropped: wanted.filter((g) => !available.includes(g)),
  };
}

const semver = (ref) => ref?.match(/^v?(\d+)\.(\d+)\.(\d+)$/)?.slice(1).map(Number) ?? null;
export function isDowngrade(from, to) {
  const [a, b] = [semver(from), semver(to)];
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return b[i] < a[i];
  return false;
}

export function mergeHooks(hookFiles) {
  const hooks = {};
  for (const { group, data } of hookFiles) {
    for (const [event, entries] of Object.entries(data.hooks ?? {})) {
      if (!Array.isArray(entries)) throw new Error(`groups/${group}/hooks.json: "${event}" must be an array`);
      (hooks[event] ??= []).push(...entries);
    }
  }
  return { version: 1, hooks };
}

// Copies the chosen groups into vendorDir; a name defined by two groups is an error, since rulesync would
// silently keep only one of them.
export function vendorGroups(agentspreadDir, groups, vendorDir) {
  rmSync(vendorDir, { recursive: true, force: true });
  const owner = new Map();
  const claim = (kind, name, group) => {
    const key = `${kind}/${name}`;
    if (owner.has(key)) throw new Error(`${kind} "${name}" is defined by both ${owner.get(key)} and ${group}`);
    owner.set(key, group);
  };
  const hookFiles = [];
  for (const group of groups) {
    const src = join(agentspreadDir, 'groups', group);
    for (const skill of listDir(join(src, 'skills')).filter((e) => e.isDirectory())) {
      claim('skill', skill.name, group);
      cpSync(join(src, 'skills', skill.name), join(vendorDir, 'skills', skill.name), { recursive: true });
    }
    for (const kind of ['subagents', 'commands']) {
      for (const file of listDir(join(src, kind)).filter((e) => e.isFile())) {
        claim(kind.slice(0, -1), file.name, group);
        mkdirSync(join(vendorDir, kind), { recursive: true });
        cpSync(join(src, kind, file.name), join(vendorDir, kind, file.name));
      }
    }
    // Namespaced by group, so hooks can reference .agentspread/scripts/<group>/<file> without collisions.
    if (existsSync(join(src, 'scripts'))) cpSync(join(src, 'scripts'), join(vendorDir, 'scripts', group), { recursive: true });
    if (existsSync(join(src, 'hooks.json'))) {
      hookFiles.push({ group, data: JSON.parse(readFileSync(join(src, 'hooks.json'), 'utf8')) });
    }
  }
  if (hookFiles.length) {
    mkdirSync(vendorDir, { recursive: true });
    writeFileSync(join(vendorDir, 'hooks.json'), `${JSON.stringify(mergeHooks(hookFiles), null, 2)}\n`);
  }
}

const hasPart = (root, part) =>
  part === 'hooks' ? existsSync(join(root, 'hooks.json')) : listDir(join(root, part)).length > 0;

export function featuresFor(existing, roots) {
  const present = PARTS.filter((p) => p === 'skills' || roots.some((r) => hasPart(r, p)));
  // A managed feature with nothing behind it would make `generate --delete` wipe what the tool already has.
  return unique([...existing.filter((f) => !PARTS.includes(f) || present.includes(f)), ...present]);
}

// Edits rulesync.jsonc as text to keep its comments: sets features and inputRoots, and drops the
// legacy `<owner>/agentbase` `sources` entries of consumers adopted before .agentspread/ existed.
export function updateRulesyncConfig(text, { source, features, targets }) {
  const list = (xs) => `[${xs.map((x) => `"${x}"`).join(', ')}]`;
  let lines = text.split('\n');

  const ours = new RegExp(`"source":\\s*"${sourcePattern(source)}"`, 'i');
  const open = lines.findIndex((l) => /"sources":\s*\[/.test(l));
  if (open >= 0) {
    if (/"sources":\s*\[.*\]/.test(lines[open])) {
      if (ours.test(lines[open])) throw new Error('rulesync.jsonc "sources" must hold one entry per line');
    } else {
      const close = lines.findIndex((l, i) => i > open && /^\s*\]/.test(l));
      if (close < 0) throw new Error('rulesync.jsonc "sources" is not closed on its own line');
      // The old sync workflow's marker comment goes with the entries it described.
      const legacyLine = (l) => ours.test(l) || /^\s*\/\/.*agentbase/i.test(l);
      const original = lines.slice(open + 1, close);
      const body = original.filter((l) => !legacyLine(l));
      const entries = body.map((l, i) => (/^\s*\{/.test(l) ? i : -1)).filter((i) => i >= 0);
      if (!entries.length && body.length < original.length) {
        // An empty "sources" left behind would only confuse readers, so the key goes too.
        const lastProp = !/,\s*$/.test(lines[close]);
        lines.splice(open, close - open + 1);
        const prev = lines.slice(0, open).findLastIndex((l) => /\S/.test(l) && !/^\s*\/\//.test(l));
        if (lastProp && prev >= 0) lines[prev] = lines[prev].replace(/,\s*$/, '');
      } else {
        const fixed = body.map((l, i) => (entries.includes(i) ? l.replace(/\s*,?\s*$/, i === entries.at(-1) ? '' : ',') : l));
        lines = [...lines.slice(0, open + 1), ...fixed, ...lines.slice(close)];
      }
    }
  }

  if (targets) {
    const targetsAt = lines.findIndex((l) => /"targets":\s*\[[^\]]*\]/.test(l));
    if (targetsAt < 0) throw new Error('rulesync.jsonc needs a one-line "targets" array');
    lines[targetsAt] = lines[targetsAt].replace(/("targets":\s*)\[[^\]]*\]/, `$1${list(targets)}`);
  }

  const featuresAt = lines.findIndex((l) => /"features":\s*\[[^\]]*\]/.test(l));
  if (featuresAt < 0) throw new Error('rulesync.jsonc needs a one-line "features" array');
  lines[featuresAt] = lines[featuresAt].replace(/("features":\s*)\[[^\]]*\]/, `$1${list(features)}`);

  const rootsAt = lines.findIndex((l) => /"inputRoots":/.test(l));
  if (rootsAt >= 0) {
    lines[rootsAt] = lines[rootsAt].replace(/("inputRoots":\s*)\[[^\]]*\]/, `$1${list(INPUT_ROOTS)}`);
  } else {
    const indent = lines[featuresAt].match(/^\s*/)[0];
    if (!/,\s*$/.test(lines[featuresAt])) lines[featuresAt] += ',';
    const lastProp = !lines.slice(featuresAt + 1).some((l) => /^\s*"/.test(l));
    lines.splice(featuresAt + 1, 0, `${indent}"inputRoots": ${list(INPUT_ROOTS)}${lastProp ? '' : ','}`);
  }
  return lines.join('\n');
}

// Before agentspread, subagents and commands came as a Claude Code plugin from an "agentbase" marketplace.
export function dropMarketplace(settings) {
  const market = settings.extraKnownMarketplaces?.agentbase;
  // An unrelated marketplace that happens to be called "agentbase" keeps its plugins.
  if (market && !market.source?.repo?.toLowerCase().endsWith('/agentbase')) return settings;
  if (market) delete settings.extraKnownMarketplaces.agentbase;
  if (settings.extraKnownMarketplaces && !Object.keys(settings.extraKnownMarketplaces).length) {
    delete settings.extraKnownMarketplaces;
  }
  for (const key of Object.keys(settings.enabledPlugins ?? {})) if (key.endsWith('@agentbase')) delete settings.enabledPlugins[key];
  if (settings.enabledPlugins && !Object.keys(settings.enabledPlugins).length) delete settings.enabledPlugins;
  return settings;
}

export function summarize(nameStatus) {
  const buckets = { skills: new Map(), subagents: new Map(), commands: new Map(), scripts: new Map(), hooks: new Map() };
  const label = { A: 'new', D: 'removed' };
  for (const line of nameStatus.split('\n').filter(Boolean)) {
    const [status, path] = line.split('\t');
    const [, kind, name] = path.split('/');
    if (kind === 'hooks.json') buckets.hooks.set('hooks.json', status[0]);
    else if (buckets[kind] && name) {
      const key = kind === 'skills' || kind === 'scripts' ? name : name.replace(/\.[^.]+$/, '');
      // A skill folder with one file added and another deleted is still just "changed".
      const prev = buckets[kind].get(key);
      buckets[kind].set(key, prev && prev !== status[0] ? 'M' : status[0]);
    }
  }
  const parts = Object.entries(buckets)
    .filter(([, m]) => m.size)
    .map(([kind, m]) => `${kind}: ${[...m].sort().map(([n, s]) => (label[s] ? `${n} (${label[s]})` : n)).join(', ')}`);
  return parts.join('; ') || 'none';
}

function downloadSource(source, ref) {
  const dir = mkdtempSync(join(tmpdir(), 'agentspread-'));
  const archive = execFileSync('gh', ['api', `repos/${source}/tarball/${encodeURIComponent(ref)}`], {
    maxBuffer: 256 * 1024 * 1024,
  });
  writeFileSync(join(dir, 'src.tgz'), archive);
  execFileSync('tar', ['-xzf', 'src.tgz'], { cwd: dir });
  const root = readdirSync(dir, { withFileTypes: true }).find((e) => e.isDirectory());
  return join(dir, root.name);
}

export function fetchTree(source, ref) {
  const out = execFileSync(
    'gh',
    ['api', `repos/${source}/git/trees/${encodeURIComponent(ref)}?recursive=1`, '-q', '.tree[].path'],
    { encoding: 'utf8' },
  );
  return parseTree(out.split('\n').filter(Boolean));
}

function apply(ref, source, repo, { groups: requested = [], setGroups, targets, from, force = false }) {
  if (!/^[^/\s]+\/[^/\s]+$/.test(source)) throw new Error(`content repo must be owner/name, got "${source}"`);
  if (!existsSync('rulesync.jsonc')) throw new Error('run from a consumer root with rulesync.jsonc');
  const config = readFileSync('rulesync.jsonc', 'utf8');
  const legacy = config.match(new RegExp(`"source":\\s*"(${sourcePattern(source)})"[^}]*"ref":\\s*"([^"]+)"`, 'i'));
  const membership = existsSync(MEMBERSHIP_FILE) ? readMembership(readFileSync(MEMBERSHIP_FILE, 'utf8')) : null;
  const current = membership
    ? { source: membership.source, ref: membership.ref }
    : legacy && { source: legacy[1].split(':')[0], ref: legacy[2] };
  // Versions of two different content repos say nothing about each other.
  const sameSource = current?.source?.toLowerCase() === source.toLowerCase();
  if (!force && sameSource && isDowngrade(current.ref, ref)) {
    throw new Error(`refusing to go from ${current.ref} back to ${ref}; pass --force`);
  }

  const agentspreadDir = from ?? downloadSource(source, ref);
  const available = listDir(join(agentspreadDir, 'groups')).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  if (!available.includes('common')) throw new Error(`${source} ${ref} has no groups/common/`);
  // --set-groups replaces the membership (reconfiguring); --groups only adds to it (adopting, syncing).
  const { groups, dropped } = setGroups
    ? resolveGroups(null, { available, repo, requested: setGroups })
    : resolveGroups(membership?.groups ?? null, { available, repo, requested });

  const hadVendor = existsSync(VENDOR_DIR);
  vendorGroups(agentspreadDir, groups, VENDOR_DIR);
  if (existsSync(join(VENDOR_DIR, 'hooks.json'))) {
    if (existsSync('.rulesync/hooks.json')) {
      throw new Error(`.rulesync/hooks.json would replace agentspread's hooks; move them to the content repo's groups/${repo}/hooks.json`);
    }
    const settings = existsSync('.claude/settings.json') ? JSON.parse(readFileSync('.claude/settings.json', 'utf8')) : {};
    // rulesync replaces the whole "hooks" key, so hooks written by hand would be lost silently.
    if (!hadVendor && settings.hooks && Object.keys(settings.hooks).length) {
      throw new Error(`.claude/settings.json already has hooks, which generation would overwrite; move them to the content repo's groups/${repo}/hooks.json`);
    }
  }

  const existing = JSON.parse(config.replace(/^\s*\/\/.*$/gm, '').match(/"features":\s*(\[[^\]]*\])/)?.[1] ?? '[]');
  const updated = updateRulesyncConfig(config, { source, features: featuresFor(existing, INPUT_ROOTS), targets });
  writeFileSync('rulesync.jsonc', updated);
  if (existsSync('rulesync.lock') && !/"sources":\s*\[[^\]]*\{/s.test(updated.replace(/^\s*\/\/.*$/gm, ''))) {
    rmSync('rulesync.lock');
    // What the old sources fetched stays in local clones and, as part of the .rulesync/ input root,
    // would keep generating skills agentspread has since dropped.
    for (const dir of ['.rulesync/skills/.curated', '.rulesync/rules/.curated']) rmSync(dir, { recursive: true, force: true });
  }
  if (existsSync('.claude/settings.json')) {
    const before = JSON.parse(readFileSync('.claude/settings.json', 'utf8'));
    const after = dropMarketplace(structuredClone(before));
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      writeFileSync('.claude/settings.json', `${JSON.stringify(after, null, 2)}\n`);
    }
  }
  writeFileSync(MEMBERSHIP_FILE, `${JSON.stringify({ source, ref, groups }, null, 2)}\n`);

  console.log(`groups: ${groups.join(', ')}`);
  if (dropped.length) console.log(`dropped groups no longer in ${source} ${ref}: ${dropped.join(', ')}`);
}

function parseArgs(args) {
  const opts = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--groups') opts.groups = (args[++i] ?? '').split(',').filter(Boolean);
    else if (args[i] === '--set-groups') opts.setGroups = (args[++i] ?? '').split(',').filter(Boolean);
    else if (args[i] === '--targets') opts.targets = (args[++i] ?? '').split(',').filter(Boolean);
    else if (args[i] === '--from') opts.from = args[++i];
    else if (args[i] === '--force') opts.force = true;
    else positional.push(args[i]);
  }
  return { positional, opts };
}

function main([command, ...args]) {
  try {
    if (command === 'apply') {
      const { positional: [ref, source, repo], opts } = parseArgs(args);
      if (!ref || !source || !repo) throw new Error('usage: apply <ref> <content owner/repo> <consumer repo> [--groups a,b | --set-groups a,b] [--targets a,b] [--from dir] [--force]');
      if (opts.targets?.length === 0) throw new Error('--targets needs at least one agent');
      apply(ref, source, repo, opts);
    } else if (command === 'summary') {
      execFileSync('git', ['add', '--all', '--intent-to-add', VENDOR_DIR]);
      console.log(summarize(execFileSync('git', ['diff', '--name-status', '--', VENDOR_DIR], { encoding: 'utf8' })));
    } else {
      throw new Error('usage: sync-consumer.mjs apply <ref> <content owner/repo> <consumer repo> [...] | summary');
    }
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }
}

// Compared as real paths: under macOS's /var → /private/var symlink the two spellings differ.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2));
}
