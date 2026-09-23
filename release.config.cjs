module.exports = {
  // Lets a repo keep main as the clean template and release its own content from another branch.
  branches: [process.env.RELEASE_BRANCH || 'main'],
  tagFormat: 'v${version}',
  plugins: [
    ['@semantic-release/commit-analyzer', { preset: 'conventionalcommits' }],
    ['@semantic-release/release-notes-generator', { preset: 'conventionalcommits' }],
    ['@semantic-release/changelog', { changelogFile: 'CHANGELOG.md', changelogTitle: '# Changelog' }],
    [
      '@semantic-release/exec',
      {
        prepareCmd: 'npm version ${nextRelease.version} --no-git-tag-version --allow-same-version',
        // Runs once the tag is pushed but before the GitHub release, so a failure there still leaves the
        // workflow knowing which tag to roll out.
        publishCmd: 'echo "tag=${nextRelease.gitTag}" >> "$GITHUB_OUTPUT"',
      },
    ],
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md', 'package.json', 'package-lock.json'],
        message: 'chore(release): ${nextRelease.version} [skip ci]',
      },
    ],
    // The App token has no issues permission, so PR/issue comments and labels would fail the release.
    ['@semantic-release/github', { successComment: false, failComment: false, releasedLabels: false }],
  ],
};
