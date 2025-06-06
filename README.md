# @sanity/diff-patch

[![npm version](https://img.shields.io/npm/v/@sanity/diff-patch.svg?style=flat-square)](https://www.npmjs.com/package/@sanity/diff-patch)[![npm bundle size](https://img.shields.io/bundlephobia/minzip/@sanity/diff-patch?style=flat-square)](https://bundlephobia.com/result?p=@sanity/diff-patch)[![npm weekly downloads](https://img.shields.io/npm/dw/@sanity/diff-patch.svg?style=flat-square)](https://www.npmjs.com/package/@sanity/diff-patch)

Generate Sanity patch mutations by comparing two documents or values. This library creates conflict-resistant patches designed for collaborative editing environments where multiple users may be editing the same document simultaneously.

## Objectives

- **Conflict-resistant patches**: Generate operations that work well in 3-way merges and collaborative scenarios
- **Performance**: Optimized for real-time, per-keystroke patch generation
- **Intent preservation**: Capture the user's intended change rather than just the final state
- **Reliability**: Consistent, well-tested behavior across different data types and editing patterns

Used internally by the Sanity App SDK for its collaborative editing system.

## Installation

```bash
npm install @sanity/diff-patch
```

## API Reference

### `diffPatch(source, target, options?)`

Generate patch mutations to transform a source document into a target document.

**Parameters:**

- `source: DocumentStub` - The original document
- `target: DocumentStub` - The desired document state
- `options?: PatchOptions` - Configuration options

**Returns:** `SanityPatchMutation[]` - Array of patch mutations

**Options:**

```typescript
interface PatchOptions {
  id?: string // Document ID (extracted from _id if not provided)
  basePath?: Path // Base path for patches (default: [])
  ifRevisionID?: string | true // Revision lock for optimistic updates
}
```

**Example:**

```js
import {diffPatch} from '@sanity/diff-patch'

const source = {
  _id: 'movie-123',
  _type: 'movie',
  _rev: 'abc',
  title: 'The Matrix',
  year: 1999,
}

const target = {
  _id: 'movie-123',
  _type: 'movie',
  title: 'The Matrix Reloaded',
  year: 2003,
  director: 'The Wachowskis',
}

const mutations = diffPatch(source, target, {ifRevisionID: true})
// [
//   {
//     patch: {
//       id: 'movie-123',
//       ifRevisionID: 'abc',
//       set: {
//         title: 'The Matrix Reloaded',
//         year: 2003,
//         director: 'The Wachowskis'
//       }
//     }
//   }
// ]
```

### `diffValue(source, target, basePath?)`

Generate patch operations for values without document wrapper.

**Parameters:**

- `source: unknown` - The original value
- `target: unknown` - The desired value state
- `basePath?: Path` - Base path to prefix operations (default: [])

**Returns:** `SanityPatchOperations[]` - Array of patch operations

**Example:**

```js
import {diffValue} from '@sanity/diff-patch'

const source = {
  name: 'John',
  tags: ['developer'],
}

const target = {
  name: 'John Doe',
  tags: ['developer', 'typescript'],
  active: true,
}

const operations = diffValue(source, target)
// [
//   {
//     set: {
//       name: 'John Doe',
//       'tags[1]': 'typescript',
//       active: true
//     }
//   }
// ]

// With base path
const operations = diffValue(source, target, ['user', 'profile'])
// [
//   {
//     set: {
//       'user.profile.name': 'John Doe',
//       'user.profile.tags[1]': 'typescript',
//       'user.profile.active': true
//     }
//   }
// ]
```

## Collaborative Editing Example

The library generates patches that preserve user intent and minimize conflicts in collaborative scenarios:

```js
// Starting document
const originalDoc = {
  _id: 'blog-post-123',
  _type: 'blogPost',
  title: 'Getting Started with Sanity',
  paragraphs: [
    {
      _key: 'intro',
      _type: 'paragraph',
      text: 'Sanity is a complete content operating system for modern applications.',
    },
    {
      _key: 'benefits',
      _type: 'paragraph',
      text: 'It offers real-time collaboration and gives developers controll over the entire stack.',
    },
    {
      _key: 'conclusion',
      _type: 'paragraph',
      text: 'Learning Sanity will help you take control of your content workflow.',
    },
  ],
}

// User A reorders paragraphs AND fixes a typo
const userAChanges = {
  ...originalDoc,
  paragraphs: [
    {
      _key: 'intro',
      _type: 'paragraph',
      text: 'Sanity is a complete content operating system for modern applications.',
    },
    {
      _key: 'conclusion', // Moved conclusion before benefits
      _type: 'paragraph',
      text: 'Learning Sanity will help you take control of your content workflow.',
    },
    {
      _key: 'benefits',
      _type: 'paragraph',
      text: 'It offers real-time collaboration and gives developers control over the entire stack.', // Fixed typo: "controll" → "control"
    },
  ],
}

// User B simultaneously improves the intro text
const userBChanges = {
  ...originalDoc,
  paragraphs: [
    {
      _key: 'intro',
      _type: 'paragraph',
      text: 'Sanity is a complete content operating system that gives developers control over the entire stack.', // Added more specific language about developer control
    },
    {
      _key: 'benefits',
      _type: 'paragraph',
      text: 'It offers real-time collaboration and gives developers control over the entire stack.',
    },
    {
      _key: 'conclusion',
      _type: 'paragraph',
      text: 'Learning Sanity will help you take control of your content workflow.',
    },
  ],
}

// Generate patches that capture each user's intent
const patchA = diffPatch(originalDoc, userAChanges)
const patchB = diffPatch(originalDoc, userBChanges)

// Apply both patches - they merge successfully because they target different aspects
// User A's reordering and typo fix + User B's content improvement both apply
const finalMergedResult = {
  _id: 'blog-post-123',
  _type: 'blogPost',
  title: 'Getting Started with Sanity',
  paragraphs: [
    {
      _key: 'intro',
      _type: 'paragraph',
      text: 'Sanity is a complete content operating system that gives developers control over the entire stack.', // ✅ User B's improvement
    },
    {
      _key: 'conclusion', // ✅ User A's reordering
      _type: 'paragraph',
      text: 'Learning Sanity will help you take control of your content workflow.',
    },
    {
      _key: 'benefits',
      _type: 'paragraph',
      text: 'It offers real-time collaboration and gives developers control over the entire stack.', // ✅ User A's typo fix
    },
  ],
}
```

## Technical Details

### String Diffing with diff-match-patch

When comparing strings, the library attempts to use [diff-match-patch](https://www.sanity.io/docs/http-patches#diffmatchpatch-aTbJhlAJ) to generate granular text patches instead of simple replacements. This preserves editing intent and enables better conflict resolution.

**Automatic selection criteria:**

- **String size limit**: Strings larger than 1MB use `set` operations
- **Change ratio threshold**: If >40% of text changes (determined by simple string length difference), uses `set` (indicates replacement vs. editing)
- **Small text optimization**: Strings <10KB will always use diff-match-patch
- **System key protection**: Properties starting with `_` (e.g. `_type`, `_key`) always use `set` operations as these are not typically edited by users

**Performance rationale:**

These thresholds are based on performance testing of the underlying `@sanity/diff-match-patch` library on an M2 MacBook Pro:

- **Keystroke editing**: 0ms for typical edits, sub-millisecond even on large strings
- **Small insertions/pastes**: 0-10ms for content <50KB
- **Large insertions/deletions**: 0-50ms for content >50KB
- **Text replacements**: Can be 70ms-2s+ due to algorithm complexity

The 40% change ratio threshold catches problematic replacement scenarios while allowing the algorithm to excel at insertions, deletions, and small edits.

**Migration from v5:**

Version 5 allowed configuring diff-match-patch behavior with `lengthThresholdAbsolute` and `lengthThresholdRelative` options. Version 6 removes these options in favor of tested defaults that provide consistent performance across real-world editing patterns. This allows us to change the behavior of this over time to better meet performance needs.

### Array Handling

**Keyed arrays**: Arrays containing objects with `_key` properties are diffed by key rather than index, producing more stable patches for collaborative editing.

**Index-based arrays**: Arrays without keys are diffed by index position.

**Undefined values**: When `undefined` values are encountered in arrays, they are converted to `null`. This follows the same behavior as `JSON.stringify()` and ensures consistent serialization. To remove undefined values before diffing:

```js
const cleanArray = array.filter((item) => typeof item !== 'undefined')
```

### System Keys

The following keys are ignored at the root of the document when diffing a document as they are managed by Sanity:

- `_id`
- `_type`
- `_createdAt`
- `_updatedAt`
- `_rev`

### Error Handling

- **Missing document ID**: Throws error if `_id` differs between documents and no explicit `id` option provided
- **Immutable \_type**: Throws error if attempting to change `_type` at document root
- **Multi-dimensional arrays**: Not supported, throws `DiffError`
- **Invalid revision**: Throws error if `ifRevisionID: true` but no `_rev` in source document

## License

MIT © [Sanity.io](https://sanity.io/)
