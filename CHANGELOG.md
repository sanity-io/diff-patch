<!-- markdownlint-disable --><!-- textlint-disable -->

# 📓 Changelog

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [5.0.0](https://github.com/sanity-io/diff-patch/compare/v4.0.0...v5.0.0) (2025-02-05)

### ⚠ BREAKING CHANGES

- Module name is now `@sanity/diff-patch` (from previous `sanity-diff-patch`). Update imports accordingly!

### Features

- rename module to `@sanity/diff-patch` ([#33](https://github.com/sanity-io/diff-patch/issues/33)) ([891241f](https://github.com/sanity-io/diff-patch/commit/891241fcebe17de4af20322fd99fbdd7dd336a76))

## [4.0.0](https://github.com/sanity-io/diff-patch/compare/v3.0.4...v4.0.0) (2024-10-15)

### ⚠ BREAKING CHANGES

- We now require node 18 or higher to run this module

### Bug Fixes

- apply unset operations first ([692f5d6](https://github.com/sanity-io/diff-patch/commit/692f5d6b6584f1fb2fb449273922d846ecbd2e34))
- require node 18.2 or higher ([dc2437b](https://github.com/sanity-io/diff-patch/commit/dc2437b3a8031f7cbbd10ccb3bc72a9a735ee98f))

## [3.0.4](https://github.com/sanity-io/diff-patch/compare/v3.0.3...v3.0.4) (2024-10-15)

### Bug Fixes

- use correct escaping for unsafe property names in paths ([53f84f8](https://github.com/sanity-io/diff-patch/commit/53f84f84da968f0689924cc1d8806d77be73f95f))

## [3.0.3](https://github.com/sanity-io/diff-patch/compare/v3.0.2...v3.0.3) (2024-10-15)

### Bug Fixes

- allow (non-leading) dashes in properties ([bce4d2f](https://github.com/sanity-io/diff-patch/commit/bce4d2f767faf7f2d8ba2705372dd8241f6364f1)), closes [#28](https://github.com/sanity-io/diff-patch/issues/28)

## [3.0.2](https://github.com/sanity-io/diff-patch/compare/v3.0.1...v3.0.2) (2023-04-28)

### Bug Fixes

- upgrade diff-match-patch dependency ([166f5e6](https://github.com/sanity-io/diff-patch/commit/166f5e6fa2de02b56c131766b9c8c67a543e0edf))

## [3.0.1](https://github.com/sanity-io/diff-patch/compare/v3.0.0...v3.0.1) (2023-04-25)

### Bug Fixes

- bump dependencies ([674aa70](https://github.com/sanity-io/diff-patch/commit/674aa7032bbc2b28cffda5c27e2cb1e5f73319e2))

## [3.0.0](https://github.com/sanity-io/diff-patch/compare/v2.0.3...v3.0.0) (2023-04-25)

### ⚠ BREAKING CHANGES

- `validateDocument()` has been removed
- `ifRevisionId` option must be written as `ifRevisionID`

### Features

- remove internal APIs, modernize tooling ([474d6ff](https://github.com/sanity-io/diff-patch/commit/474d6ffa723cf834fcedb21b96c3b78dd03c12bf))
