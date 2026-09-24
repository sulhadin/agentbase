// semantic-release config for content repos, loaded by the reusable release workflow.
// It runs inside the content repo, which has none of these packages installed: semantic-release looks
// plugins up from its working directory, so each is resolved here, next to agentbase's node_modules.
const local = (name) => require.resolve(name);
const preset = { config: local('conventional-changelog-conventionalcommits') };

module.exports = {
  // Lets a content repo release from a branch other than main.
  branches: [process.env.RELEASE_BRANCH || 'main'],
  tagFormat: 'v${version}',
  plugins: [
    [local('@semantic-release/commit-analyzer'), preset],
    [local('@semantic-release/release-notes-generator'), preset],
    [local('@semantic-release/changelog'), { changelogFile: 'CHANGELOG.md', changelogTitle: '# Changelog' }],
    [
      local('@semantic-release/exec'),
      {
        // Runs once the tag is pushed but before the GitHub release, so a failure there still leaves the
        // workflow knowing which tag to roll out.
        publishCmd: 'echo "tag=${nextRelease.gitTag}" >> "$GITHUB_OUTPUT"',
      },
    ],
    [local('@semantic-release/git'), { assets: ['CHANGELOG.md'], message: 'chore(release): ${nextRelease.version} [skip ci]' }],
    // The App token has no issues permission, so PR/issue comments and labels would fail the release.
    [local('@semantic-release/github'), { successComment: false, failComment: false, releasedLabels: false }],
  ],
};
