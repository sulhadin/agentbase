module.exports = {
  branches: ['main'],
  tagFormat: 'v${version}',
  plugins: [
    ['@semantic-release/commit-analyzer', { preset: 'conventionalcommits' }],
    ['@semantic-release/release-notes-generator', { preset: 'conventionalcommits' }],
    ['@semantic-release/changelog', { changelogFile: 'CHANGELOG.md', changelogTitle: '# Changelog' }],
    // Claude Code only pulls a plugin update when plugin.json's version changes.
    ['@semantic-release/exec', { prepareCmd: 'node scripts/set-version.mjs ${nextRelease.version}' }],
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md', 'package.json', 'package-lock.json', 'plugins/agentbase/.claude-plugin/plugin.json'],
        message: 'chore(release): ${nextRelease.version} [skip ci]',
      },
    ],
    // The App token has no issues permission, so PR/issue comments and labels would fail the release.
    ['@semantic-release/github', { successComment: false, failComment: false, releasedLabels: false }],
  ],
};
