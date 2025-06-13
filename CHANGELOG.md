<!-- markdownlint-disable --><!-- textlint-disable -->

# 📓 Changelog

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [6.0.0](https://github.com/sanity-io/diff-patch/compare/v5.0.0...v6.0.0) (2025-06-13)

### ⚠ BREAKING CHANGES

- API Rename and Visibility:\*\*
  - The `diffItem` function is no longer exported. Its functionality is now primarily internal.
  - A new function `diffValue(source: unknown, target: unknown, basePath?: Path): SanityPatchOperations[]` is introduced and exported. This function generates an array of `SanityPatchOperations` (which are plain objects like `{set: {...}}`, `{unset: [...]}`) based on the differences between `source` and `target` values. It does _not_ wrap these operations in the `SanityPatchMutation` structure.
  - The `diffPatch` function (which diffs documents and returns `SanityPatchMutation[]`) now internally calls `diffItem` and then uses the refactored `serializePatches` to construct the final mutations. The logic for adding `id` and `ifRevisionID` to the patch mutations now resides within `diffPatch`.
- Patch Type Refinements:\*\*
  - Removed older, more generic patch types like `SetPatch`, `InsertAfterPatch`, `SanitySetPatch`, `SanityUnsetPatch`, `SanityInsertPatch`, and `SanityDiffMatchPatch` from the public API (some were previously exported from `patches.ts`).
  - Introduced new, more specific types for patch operations:
    - `SanitySetPatchOperation` (`{ set: Record<string, unknown> }`)
    - `SanityUnsetPatchOperation` (`{ unset: string[] }`)
    - `SanityInsertPatchOperation` (`{ insert: { before/after/replace: string, items: unknown[] } }`)
    - `SanityDiffMatchPatchOperation` (`{ diffMatchPatch: Record<string, string> }`)
  - The `SanityPatchOperations` type is now a `Partial` union of these new operation types, reflecting that a single patch object from `diffValue` will contain one or more of these operations.
  - The `SanityPatch` type (used within `SanityPatchMutation`) now `extends SanityPatchOperations` and includes `id` and optional `ifRevisionID`.
  - The internal `Patch` type (used by `diffItem`) remains but is now an internal detail.
- **Refactored `serializePatches` Function:**
  - The `serializePatches` function now takes an array of internal `Patch` objects and returns an array of `SanityPatchOperation[]` (the raw operation objects like `{set: {...}}`).
  - It no longer handles adding `id` or `ifRevisionID`; this responsibility is moved to the `diffPatch` function.
  - The logic for grouping `set`, `unset`, `insert`, and `diffMatchPatch` operations into distinct objects in the output array has been improved for clarity.
- **Refactored `diffPatch` Function:**
  - Now calls the internal `diffItem` to get the raw patch list.
  - Calls the refactored `serializePatches` to get `SanityPatchOperations[]`.
  - Maps over these operations to create `SanityPatchMutation[]`, adding the `id` to each and `ifRevisionID` _only to the first patch mutation in the array_.
- **JSDoc Updates:**
  - Updated JSDoc for `diffValue` to clearly explain its purpose, parameters, and return type.
  - Updated JSDoc for `diffPatch` and internal types to reflect the changes.

**Rationale:**

- **Clearer Public API:** `diffValue` provides a more intuitive name for diffing arbitrary JavaScript values and returning the raw operations, distinct from `diffPatch` which is document-centric.
- **Improved Type Safety & Granularity:** The new `Sanity...Operation` types are more precise and make it easier to work with the different kinds of patch operations programmatically.
- **Correct `ifRevisionID` Handling:** Ensuring `ifRevisionID` is only on the first patch of a transaction is crucial for correct optimistic locking in Sanity.
- **Better Separation of Concerns:** `diffItem` focuses on generating a flat list of diffs, `serializePatches` (as used by `diffValue`) groups them into operations, and `diffPatch` handles the document-specific concerns like `_id` and `ifRevisionID`.

This refactor provides a cleaner and more robust API for generating patches, both for full documents and for arbitrary values.

- remove undefined-to-null conversion warnings and simplify internal APIs (#38)

---

    *   Removed the `diffMatchPatch` options (`enabled`, `lengthThresholdAbsolute`, `lengthThresholdRelative`) from `PatchOptions`.
    *   Removed the `DiffMatchPatchOptions` and `DiffOptions` (which included `diffMatchPatch`) interfaces from the public API.
    *   Removed the internal `mergeOptions` function and the DMP-specific parts of `defaultOptions`.

- **New Performance-Based Heuristics for DMP:**
  - Introduced a new exported utility function `shouldUseDiffMatchPatch(source: string, target: string): boolean`. This function encapsulates the new logic for deciding whether to use DMP.
  - The decision is now based on:
    - **Document Size Limit:** Documents larger than 1MB (`DMP_MAX_DOCUMENT_SIZE`) will use `set` operations.
    - **Change Ratio Threshold:** If more than 40% (`DMP_MAX_CHANGE_RATIO`) of the text changes, `set` is used (indicates replacement vs. editing).
    - **Small Document Optimization:** Documents smaller than 10KB (`DMP_MIN_SIZE_FOR_RATIO_CHECK`) always use DMP, as performance is consistently high for these.
    - **System Key Protection:** Properties starting with `_` (system keys) continue to use `set` operations.
  - Added extensive JSDoc to `shouldUseDiffMatchPatch` detailing the heuristic rationale, performance characteristics (based on testing `@sanity/diff-match-patch` on an M2 MacBook Pro), algorithm details, and test methodology.
- **Internal Simplification:**
  - The internal `getDiffMatchPatch` function now uses `shouldUseDiffMatchPatch` to make its decision and no longer accepts DMP-related options.
  - Simplified the call to the underlying `@sanity/diff-match-patch` library within `getDiffMatchPatch` to use `makePatches(source, target)` directly. This is more concise and leverages the internal optimizations of that library, with performance validated to be equivalent to the previous multi-step approach.
- **Constants:** Introduced `SYSTEM_KEYS`, `DMP_MAX_DOCUMENT_SIZE`, `DMP_MAX_CHANGE_RATIO`, and `DMP_MIN_SIZE_FOR_RATIO_CHECK` to define these thresholds.
- **Test Updates:** Snapshots have been updated to reflect the new DMP behavior based on these heuristics.

**Rationale for Change:**

The previous configurable thresholds for DMP were somewhat arbitrary and could lead to suboptimal performance or overly verbose patches in certain scenarios. This change is based on empirical performance testing of the `@sanity/diff-match-patch` library itself. The new heuristics are designed to:

- **Optimize for common editing patterns:** Ensure fast performance for keystrokes and small pastes, which are the most frequent operations.
- **Prevent performance degradation:** Avoid triggering complex and potentially slow DMP algorithm paths when users perform large text replacements (e.g., pasting entirely new content).
- **Simplify the API:** Remove the burden of configuration from the user, providing sensible defaults.
- **Maintain conflict-resistance:** Continue to leverage DMP's strengths for collaborative editing where appropriate.

By hardcoding these well-tested heuristics, we aim for a more robust and performant string diffing strategy by default.

### Features

- add key-based reordering support for keyed object arrays ([#41](https://github.com/sanity-io/diff-patch/issues/41)) ([27dcdc2](https://github.com/sanity-io/diff-patch/commit/27dcdc29c151c81705dba18348ff6f861fd4e264))
- remove undefined-to-null conversion warnings and simplify internal APIs ([#38](https://github.com/sanity-io/diff-patch/issues/38)) ([86cff6e](https://github.com/sanity-io/diff-patch/commit/86cff6ed5af1e715145bec6cfd97c72ecc2903ac))
- replace `diffItem` with `diffValue` ([#39](https://github.com/sanity-io/diff-patch/issues/39)) ([b8ad36a](https://github.com/sanity-io/diff-patch/commit/b8ad36a2cf6fd711ebc83bb78a1f8fa1014963b6))
- replace configurable DMP with perf-based heuristics ([#36](https://github.com/sanity-io/diff-patch/issues/36)) ([9577019](https://github.com/sanity-io/diff-patch/commit/95770191eb4f329c8c9591371435d435dfbb4646))

### Bug Fixes

- add repository field ([d85b998](https://github.com/sanity-io/diff-patch/commit/d85b998e0fe3d5c6534f4436ada76a628e7d43df))

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
