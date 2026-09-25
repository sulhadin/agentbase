# Changelog

## [1.1.0](https://github.com/sulhadin/agentspread/compare/v1.0.0...v1.1.0) (2026-09-25)

### Features

* npm run group creates a group with placeholder files ([#23](https://github.com/sulhadin/agentspread/issues/23)) ([8c29941](https://github.com/sulhadin/agentspread/commit/8c29941e8b3ffafa1b7667d1c5754801e9952bc9))
* onboard and reconfigure get their own npm scripts; docs spell out every step ([#21](https://github.com/sulhadin/agentspread/issues/21)) ([bf51ee1](https://github.com/sulhadin/agentspread/commit/bf51ee1aa86ce657f4a0a4dfd97323ccb2a04c62))
* share AGENTS.md instructions through a managed section in consumers ([#22](https://github.com/sulhadin/agentspread/issues/22)) ([9f15786](https://github.com/sulhadin/agentspread/commit/9f157868ff4d28be72cb2f94d8e989567e0727dc)), closes [#21](https://github.com/sulhadin/agentspread/issues/21)

### Bug Fixes

* remove template-era leftovers from the CLI and sync logic ([#18](https://github.com/sulhadin/agentspread/issues/18)) ([27d0794](https://github.com/sulhadin/agentspread/commit/27d0794209bf5ae7d82cef2432360383ff6f2c35)), closes [#17](https://github.com/sulhadin/agentspread/issues/17)

## [1.0.0](https://github.com/sulhadin/agentspread/compare/v0.3.0...v1.0.0) (2026-09-24)

### ⚠ BREAKING CHANGES

* rename agentbase to agentspread (#16)
* ship agentbase as an npm package with reusable workflows (#15)

### Features

* **groups:** per-group skills, subagents, commands and hooks committed into consumers ([#13](https://github.com/sulhadin/agentspread/issues/13)) ([450178f](https://github.com/sulhadin/agentspread/commit/450178f5b41b9d82d7930f6ac35bad1764e3bb06))
* **release:** release from the RELEASE_BRANCH repo variable ([#10](https://github.com/sulhadin/agentspread/issues/10)) ([a640221](https://github.com/sulhadin/agentspread/commit/a6402216c70dfc86dce6f11ffe28de1dcab8c680))
* **setup:** reconfigure an adopted repo's groups and agents ([#14](https://github.com/sulhadin/agentspread/issues/14)) ([26b03e5](https://github.com/sulhadin/agentspread/commit/26b03e51303ac7b88f6686a882aca2953617d07d))
* ship agentbase as an npm package with reusable workflows ([#15](https://github.com/sulhadin/agentspread/issues/15)) ([db514e6](https://github.com/sulhadin/agentspread/commit/db514e6751f3fe5ea3f1b33ad5f3febfd0faa30c))
* **sync:** pin the plugin marketplace to the release tag ([#12](https://github.com/sulhadin/agentspread/issues/12)) ([744500a](https://github.com/sulhadin/agentspread/commit/744500a5503bb268fa50c0b8b2ab8336fdaee5a0))

### Bug Fixes

* **adopt:** catch generated files hidden by .gitignore ([#7](https://github.com/sulhadin/agentspread/issues/7)) ([ef5e510](https://github.com/sulhadin/agentspread/commit/ef5e5102b425ddc2649fbe7e670c82c6d397c8ee))
* **setup:** judge adoption by rulesync.jsonc, reuse stale branches ([#8](https://github.com/sulhadin/agentspread/issues/8)) ([2e9fca8](https://github.com/sulhadin/agentspread/commit/2e9fca8b35575ebbe1b69bcc2940c487db65cdab))

### Code Refactoring

* rename agentbase to agentspread ([#16](https://github.com/sulhadin/agentspread/issues/16)) ([46f766f](https://github.com/sulhadin/agentspread/commit/46f766f20ac76c1b6decc70fc04345e7631e7320))
