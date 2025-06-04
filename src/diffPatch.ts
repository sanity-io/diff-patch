import {makePatches, stringifyPatches} from '@sanity/diff-match-patch'
import {DiffError} from './diffError.js'
import {isKeyedObject, type KeyedSanityObject, type Path, pathToString} from './paths.js'
import {validateProperty} from './validate.js'
import {
  type Patch,
  type UnsetPatch,
  type DiffMatchPatch,
  type SanityPatchMutation,
  type SanityPatchOperations,
  type SanitySetPatchOperation,
  type SanityUnsetPatchOperation,
  type SanityInsertPatchOperation,
  type SanityDiffMatchPatchOperation,
} from './patches.js'
import {difference, intersection} from './setOperations.js'

/**
 * Document keys that are ignored during diff operations.
 * These are system-managed fields that should not be included in patches on
 * top-level documents and should not be diffed with diff-match-patch.
 */
const SYSTEM_KEYS = ['_id', '_type', '_createdAt', '_updatedAt', '_rev']

/**
 * Maximum size of strings to consider for diff-match-patch (1MB)
 * Based on testing showing consistently good performance up to this size
 */
const DMP_MAX_STRING_SIZE = 1_000_000

/**
 * Maximum difference in string length before falling back to set operations (40%)
 * Above this threshold, likely indicates text replacement which can be slow
 */
const DMP_MAX_STRING_LENGTH_CHANGE_RATIO = 0.4

/**
 * Minimum string size to apply change ratio check (10KB)
 * Small strings are always fast regardless of change ratio
 */
const DMP_MIN_SIZE_FOR_RATIO_CHECK = 10_000

/**
 * An object (record) that _may_ have a `_key` property
 *
 * @internal
 */
export type SanityObject = KeyedSanityObject | Partial<KeyedSanityObject>

/**
 * Represents a partial Sanity document (eg a "stub").
 *
 * @public
 */
export interface DocumentStub {
  _id?: string
  _type?: string
  _rev?: string
  _createdAt?: string
  _updatedAt?: string
  [key: string]: unknown
}

/**
 * Options for the patch generator
 *
 * @public
 */
export interface PatchOptions {
  /**
   * Document ID to apply the patch to.
   *
   * @defaultValue `undefined` - tries to extract `_id` from passed document
   */
  id?: string

  /**
   * Base path to apply the patch to - useful if diffing sub-branches of a document.
   *
   * @defaultValue `[]` - eg root of the document
   */
  basePath?: Path

  /**
   * Only apply the patch if the document revision matches this value.
   * If the property is the boolean value `true`, it will attempt to extract
   * the revision from the document `_rev` property.
   *
   * @defaultValue `undefined` (do not apply revision check)
   */
  ifRevisionID?: string | true
}

/**
 * Generates an array of mutations for Sanity, based on the differences between
 * the two passed documents/trees.
 *
 * @param source - The first document/tree to compare
 * @param target - The second document/tree to compare
 * @param opts - Options for the diff generation
 * @returns Array of mutations
 * @public
 */
export function diffPatch(
  source: DocumentStub,
  target: DocumentStub,
  options: PatchOptions = {},
): SanityPatchMutation[] {
  const id = options.id || (source._id === target._id && source._id)
  const revisionLocked = options.ifRevisionID
  const ifRevisionID = typeof revisionLocked === 'boolean' ? source._rev : revisionLocked
  const basePath = options.basePath || []
  if (!id) {
    throw new Error(
      '_id on source and target not present or differs, specify document id the mutations should be applied to',
    )
  }

  if (revisionLocked === true && !ifRevisionID) {
    throw new Error(
      '`ifRevisionID` is set to `true`, but no `_rev` was passed in item A. Either explicitly set `ifRevisionID` to a revision, or pass `_rev` as part of item A.',
    )
  }

  if (basePath.length === 0 && source._type !== target._type) {
    throw new Error(`_type is immutable and cannot be changed (${source._type} => ${target._type})`)
  }

  const operations = diffItem(source, target, basePath, [])
  return serializePatches(operations).map((patchOperations, i) => ({
    patch: {
      id,
      // only add `ifRevisionID` to the first patch
      ...(i === 0 && ifRevisionID && {ifRevisionID}),
      ...patchOperations,
    },
  }))
}

/**
 * Generates an array of patch operation objects for Sanity, based on the
 * differences between the two passed values
 *
 * @param source - The source value to start off with
 * @param target - The target value that the patch operations will aim to create
 * @param basePath - An optional path that will be prefixed to all subsequent patch operations
 * @returns Array of mutations
 * @public
 */
export function diffValue(
  source: unknown,
  target: unknown,
  basePath: Path = [],
): SanityPatchOperations[] {
  return serializePatches(diffItem(source, target, basePath))
}

function diffItem(
  source: unknown,
  target: unknown,
  path: Path = [],
  patches: Patch[] = [],
): Patch[] {
  if (source === target) {
    return patches
  }

  if (typeof source === 'string' && typeof target === 'string') {
    diffString(source, target, path, patches)
    return patches
  }

  if (Array.isArray(source) && Array.isArray(target)) {
    diffArray(source, target, path, patches)
    return patches
  }

  if (isRecord(source) && isRecord(target)) {
    diffObject(source, target, path, patches)
    return patches
  }

  if (target === undefined) {
    patches.push({op: 'unset', path})
    return patches
  }

  patches.push({op: 'set', path, value: target})
  return patches
}

function diffObject(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
  path: Path,
  patches: Patch[],
) {
  const atRoot = path.length === 0
  const aKeys = Object.keys(source)
    .filter(atRoot ? isNotIgnoredKey : yes)
    .map((key) => validateProperty(key, source[key], path))

  const aKeysLength = aKeys.length
  const bKeys = Object.keys(target)
    .filter(atRoot ? isNotIgnoredKey : yes)
    .map((key) => validateProperty(key, target[key], path))

  const bKeysLength = bKeys.length

  // Check for deleted items
  for (let i = 0; i < aKeysLength; i++) {
    const key = aKeys[i]
    if (!(key in target)) {
      patches.push({op: 'unset', path: path.concat(key)})
    }
  }

  // Check for changed items
  for (let i = 0; i < bKeysLength; i++) {
    const key = bKeys[i]
    diffItem(source[key], target[key], path.concat([key]), patches)
  }

  return patches
}

function diffArray(source: unknown[], target: unknown[], path: Path, patches: Patch[]) {
  if (isUniquelyKeyed(source) && isUniquelyKeyed(target)) {
    return diffArrayByKey(source, target, path, patches)
  }

  return diffArrayByIndex(source, target, path, patches)
}

function diffArrayByIndex(source: unknown[], target: unknown[], path: Path, patches: Patch[]) {
  // Check for new items
  if (target.length > source.length) {
    patches.push({
      op: 'insert',
      position: 'after',
      path: path.concat([-1]),
      items: target.slice(source.length).map(nullifyUndefined),
    })
  }

  // Check for deleted items
  if (target.length < source.length) {
    const isSingle = source.length - target.length === 1
    const unsetItems = source.slice(target.length)

    // If we have unique array keys, we'll want to unset by key, as this is
    // safer in a realtime, collaborative setting
    if (isUniquelyKeyed(unsetItems)) {
      patches.push(
        ...unsetItems.map(
          (item): UnsetPatch => ({op: 'unset', path: path.concat({_key: item._key})}),
        ),
      )
    } else {
      patches.push({
        op: 'unset',
        path: path.concat([isSingle ? target.length : [target.length, '']]),
      })
    }
  }

  // Check for illegal array contents
  for (let i = 0; i < target.length; i++) {
    if (Array.isArray(target[i])) {
      throw new DiffError('Multi-dimensional arrays not supported', path.concat(i), target[i])
    }
  }

  const overlapping = Math.min(source.length, target.length)
  const segmentA = source.slice(0, overlapping)
  const segmentB = target.slice(0, overlapping)

  for (let i = 0; i < segmentA.length; i++) {
    diffItem(segmentA[i], nullifyUndefined(segmentB[i]), path.concat(i), patches)
  }

  return patches
}

/**
 * Diffs two arrays of keyed objects by their `_key` properties.
 *
 * This approach is preferred over index-based diffing for collaborative editing scenarios
 * because it generates patches that are more resilient to concurrent modifications.
 * When multiple users edit the same array simultaneously, key-based patches have better
 * conflict resolution characteristics than index-based patches.
 *
 * The function handles three main operations:
 * 1. **Reordering**: When existing items change positions within the array
 * 2. **Content changes**: When the content of existing items is modified
 * 3. **Insertions/Deletions**: When items are added or removed from the array
 *
 * @param source - The original array with keyed objects
 * @param target - The target array with keyed objects
 * @param path - The path to this array within the document
 * @param patches - Array to accumulate generated patches
 * @returns The patches array with new patches appended
 */
function diffArrayByKey(
  source: KeyedSanityObject[],
  target: KeyedSanityObject[],
  path: Path,
  patches: Patch[],
) {
  // Create lookup maps for efficient key-based access to array items
  const sourceItemsByKey = new Map(source.map((item) => [item._key, item]))
  const targetItemsByKey = new Map(target.map((item) => [item._key, item]))

  // Categorize keys by their presence in source vs target arrays
  const sourceKeys = new Set(sourceItemsByKey.keys())
  const targetKeys = new Set(targetItemsByKey.keys())
  const keysRemovedFromSource = difference(sourceKeys, targetKeys)
  const keysAddedToTarget = difference(targetKeys, sourceKeys)
  const keysInBothArrays = intersection(sourceKeys, targetKeys)

  // Handle reordering of existing items within the array.
  // We detect reordering by comparing the relative positions of keys that exist in both arrays,
  // excluding keys that were added or removed (since they don't participate in reordering).
  const sourceKeysStillPresent = Array.from(difference(sourceKeys, keysRemovedFromSource))
  const targetKeysAlreadyPresent = Array.from(difference(targetKeys, keysAddedToTarget))

  // Track which keys need to be reordered by comparing their relative positions
  const keyReorderOperations: {sourceKey: string; targetKey: string}[] = []

  for (let i = 0; i < keysInBothArrays.size; i++) {
    const keyAtPositionInSource = sourceKeysStillPresent[i]
    const keyAtPositionInTarget = targetKeysAlreadyPresent[i]

    // If different keys occupy the same relative position, a reorder is needed
    if (keyAtPositionInSource !== keyAtPositionInTarget) {
      keyReorderOperations.push({
        sourceKey: keyAtPositionInSource,
        targetKey: keyAtPositionInTarget,
      })
    }
  }

  // Generate reorder patch if any items changed positions
  if (keyReorderOperations.length) {
    patches.push({
      op: 'reorder',
      path,
      snapshot: source,
      reorders: keyReorderOperations,
    })
  }

  // Process content changes for items that exist in both arrays
  for (const key of keysInBothArrays) {
    diffItem(sourceItemsByKey.get(key), targetItemsByKey.get(key), [...path, {_key: key}], patches)
  }

  // Remove items that no longer exist in the target array
  for (const keyToRemove of keysRemovedFromSource) {
    patches.push({op: 'unset', path: [...path, {_key: keyToRemove}]})
  }

  // Insert new items that were added to the target array
  // We batch consecutive insertions for efficiency and insert them at the correct positions
  if (keysAddedToTarget.size) {
    let insertionAnchorKey: string // The key after which we'll insert pending items
    let itemsPendingInsertion: unknown[] = []

    const flushPendingInsertions = () => {
      if (itemsPendingInsertion.length) {
        patches.push({
          op: 'insert',
          // Insert after the anchor key if we have one, otherwise insert at the beginning
          ...(insertionAnchorKey
            ? {position: 'after', path: [...path, {_key: insertionAnchorKey}]}
            : {position: 'before', path: [...path, 0]}),
          items: itemsPendingInsertion,
        })
      }
    }

    // Walk through the target array to determine where new items should be inserted
    for (const key of targetKeys) {
      if (keysAddedToTarget.has(key)) {
        // This is a new item - add it to the pending insertion batch
        itemsPendingInsertion.push(targetItemsByKey.get(key)!)
      } else if (keysInBothArrays.has(key)) {
        // This is an existing item - flush any pending insertions before it
        flushPendingInsertions()
        insertionAnchorKey = key
        itemsPendingInsertion = []
      }
    }

    // Flush any remaining insertions at the end
    flushPendingInsertions()
  }

  return patches
}

/**
 * Determines whether to use diff-match-patch or fallback to a `set` operation
 * when creating a patch to transform a `source` string to `target` string.
 *
 * `diffMatchPatch` patches are typically preferred to `set` operations because
 * they handle conflicts better (when multiple editors work simultaneously) by
 * preserving the user's intended and allowing for 3-way merges.
 *
 * **Heuristic rationale:**
 *
 * Perf analysis revealed that string length has minimal impact on small,
 * keystroke-level changes, but large text replacements (high change ratio) can
 * trigger worst-case algorithm behavior. The 40% change ratio threshold is a
 * simple heuristic that catches problematic replacement scenarios while
 * allowing the algorithm to excel at insertions and deletions.
 *
 * **Performance characteristics (tested on M2 MacBook Pro):**
 *
 * *Keystroke-level editing (most common use case):*
 * - Small strings (1KB-10KB): 0ms for 1-5 keystrokes, consistently sub-millisecond
 * - Medium strings (50KB-200KB): 0ms for 1-5 keystrokes, consistently sub-millisecond
 * - 10 simultaneous keystrokes: ~12ms on 100KB strings
 *
 * *Copy-paste operations (less frequent):*
 * - Small copy-paste operations (<50KB): 0-10ms regardless of string length
 * - Large insertions/deletions (50KB+): 0-50ms (excellent performance)
 * - Large text replacements (50KB+): 70ms-2s+ (can be slow due to algorithm complexity)
 *
 * **Algorithm details:**
 * Uses Myers' diff algorithm with O(ND) time complexity where N=text length and D=edit distance.
 * Includes optimizations: common prefix/suffix removal, line-mode processing, and timeout protection.
 *
 *
 * **Test methodology:**
 * - Generated realistic word-based text patterns
 * - Simulated actual editing behaviors (keystrokes vs copy-paste)
 * - Measured performance across string sizes from 1KB to 10MB
 * - Validated against edge cases including repetitive text and scattered changes
 *
 * @param source - The previous version of the text
 * @param target - The new version of the text
 * @returns true if diff-match-patch should be used, false if fallback to set operation
 *
 * @example
 * ```typescript
 * // Keystroke editing - always fast
 * shouldUseDiffMatchPatch(largeDoc, largeDocWithTypo) // true, ~0ms
 *
 * // Small paste - always fast
 * shouldUseDiffMatchPatch(doc, docWithSmallInsertion) // true, ~0ms
 *
 * // Large replacement - potentially slow
 * shouldUseDiffMatchPatch(article, completelyDifferentArticle) // false, use set
 * ```
 *
 * Compatible with @sanity/diff-match-patch@3.2.0
 */
export function shouldUseDiffMatchPatch(source: string, target: string): boolean {
  const maxLength = Math.max(source.length, target.length)

  // Always reject strings larger than our tested size limit
  if (maxLength > DMP_MAX_STRING_SIZE) {
    return false
  }

  // For small strings, always use diff-match-patch regardless of change ratio
  // Performance testing showed these are always fast (<10ms)
  if (maxLength < DMP_MIN_SIZE_FOR_RATIO_CHECK) {
    return true
  }

  // Calculate the change ratio to detect large text replacements
  // High ratios indicate replacement scenarios which can trigger slow algorithm paths
  const lengthDifference = Math.abs(target.length - source.length)
  const changeRatio = lengthDifference / maxLength

  // If change ratio is high, likely a replacement operation that could be slow
  // Fall back to set operation for better user experience
  if (changeRatio > DMP_MAX_STRING_LENGTH_CHANGE_RATIO) {
    return false
  }

  // All other cases: use diff-match-patch
  // This covers keystroke editing and insertion/deletion scenarios which perform excellently
  return true
}

function getDiffMatchPatch(source: string, target: string, path: Path): DiffMatchPatch | undefined {
  const last = path.at(-1)
  // don't use diff-match-patch for system keys
  if (typeof last === 'string' && last.startsWith('_')) return undefined
  if (!shouldUseDiffMatchPatch(source, target)) return undefined

  try {
    // Using `makePatches(string, string)` directly instead of the multi-step approach e.g.
    // `stringifyPatches(makePatches(cleanupEfficiency(makeDiff(source, target))))`.
    // this is because `makePatches` internally handles diff generation and
    // automatically applies both `cleanupSemantic()` and `cleanupEfficiency()`
    // when beneficial, resulting in cleaner code with near identical performance and
    // better error handling.
    // [source](https://github.com/sanity-io/diff-match-patch/blob/v3.2.0/src/patch/make.ts#L67-L76)
    //
    // Performance validation (M2 MacBook Pro):
    // Both approaches measured at identical performance:
    // - 10KB strings: 0-1ms total processing time
    // - 100KB strings: 0-1ms total processing time
    // - Individual step breakdown: makeDiff(0ms) + cleanup(0ms) + makePatches(0ms) + stringify(~1ms)
    const strPatch = stringifyPatches(makePatches(source, target))
    return {op: 'diffMatchPatch', path, value: strPatch}
  } catch (err) {
    // Fall back to using regular set patch
    return undefined
  }
}

function diffString(source: string, target: string, path: Path, patches: Patch[]) {
  const dmp = getDiffMatchPatch(source, target, path)
  patches.push(dmp ?? {op: 'set', path, value: target})
  return patches
}

function isNotIgnoredKey(key: string) {
  return SYSTEM_KEYS.indexOf(key) === -1
}

// mutually exclusive operations
type SanityPatchOperation =
  | SanitySetPatchOperation
  | SanityUnsetPatchOperation
  | SanityInsertPatchOperation
  | SanityDiffMatchPatchOperation

function serializePatches(patches: Patch[], curr?: SanityPatchOperation): SanityPatchOperations[] {
  const [patch, ...rest] = patches
  if (!patch) return curr ? [curr] : []

  switch (patch.op) {
    case 'set':
    case 'diffMatchPatch': {
      // TODO: reconfigure eslint to use @typescript-eslint/no-unused-vars
      // eslint-disable-next-line no-unused-vars
      type CurrentOp = Extract<SanityPatchOperation, {[K in typeof patch.op]: {}}>
      const emptyOp = {[patch.op]: {}} as CurrentOp

      if (!curr) return serializePatches(patches, emptyOp)
      if (!(patch.op in curr)) return [curr, ...serializePatches(patches, emptyOp)]

      Object.assign((curr as CurrentOp)[patch.op], {[pathToString(patch.path)]: patch.value})
      return serializePatches(rest, curr)
    }
    case 'unset': {
      const emptyOp = {unset: []}
      if (!curr) return serializePatches(patches, emptyOp)
      if (!('unset' in curr)) return [curr, ...serializePatches(patches, emptyOp)]

      curr.unset.push(pathToString(patch.path))
      return serializePatches(rest, curr)
    }
    case 'insert': {
      if (curr) return [curr, ...serializePatches(patches)]

      return [
        {
          insert: {
            [patch.position]: pathToString(patch.path),
            items: patch.items,
          },
        } as SanityInsertPatchOperation,
        ...serializePatches(rest),
      ]
    }
    case 'reorder': {
      if (curr) return [curr, ...serializePatches(patches)]

      // REORDER STRATEGY: Two-phase approach to avoid key collisions
      //
      // Problem: Direct key swaps can cause collisions. For example, swapping A↔B:
      // - Set A's content to B: ✓
      // - Set B's content to A: ✗ (A's content was already overwritten)
      //
      // Solution: Use temporary keys as an intermediate step
      // Phase 1: Move all items to temporary keys with their final content
      // Phase 2: Update just the _key property to restore the final keys

      // Phase 1: Move items to collision-safe temporary keys
      const tempKeyOperations: SanityPatchOperations = {}
      tempKeyOperations.set = {}

      for (const {sourceKey, targetKey} of patch.reorders) {
        const temporaryKey = `__temp_reorder_${sourceKey}__`
        const finalContentForThisPosition =
          patch.snapshot[getIndexForKey(patch.snapshot, targetKey)]

        Object.assign(tempKeyOperations.set, {
          [pathToString([...patch.path, {_key: sourceKey}])]: {
            ...finalContentForThisPosition,
            _key: temporaryKey,
          },
        })
      }

      // Phase 2: Update _key properties to restore the intended final keys
      const finalKeyOperations: SanityPatchOperations = {}
      finalKeyOperations.set = {}

      for (const {sourceKey, targetKey} of patch.reorders) {
        const temporaryKey = `__temp_reorder_${sourceKey}__`

        Object.assign(finalKeyOperations.set, {
          [pathToString([...patch.path, {_key: temporaryKey}, '_key'])]: targetKey,
        })
      }

      return [tempKeyOperations, finalKeyOperations, ...serializePatches(rest)]
    }
    default: {
      return []
    }
  }
}

function isUniquelyKeyed(arr: unknown[]): arr is KeyedSanityObject[] {
  const seenKeys = new Set<string>()

  for (const item of arr) {
    // Each item must be a keyed object with a _key property
    if (!isKeyedObject(item)) return false

    // Each _key must be unique within the array
    if (seenKeys.has(item._key)) return false

    seenKeys.add(item._key)
  }

  return true
}

// Cache to avoid recomputing key-to-index mappings for the same array
const keyToIndexCache = new WeakMap<KeyedSanityObject[], Record<string, number>>()

function getIndexForKey(keyedArray: KeyedSanityObject[], targetKey: string) {
  const cachedMapping = keyToIndexCache.get(keyedArray)
  if (cachedMapping) return cachedMapping[targetKey]

  // Build a mapping from _key to array index
  const keyToIndexMapping = keyedArray.reduce<Record<string, number>>(
    (mapping, {_key}, arrayIndex) => {
      mapping[_key] = arrayIndex
      return mapping
    },
    {},
  )

  keyToIndexCache.set(keyedArray, keyToIndexMapping)

  return keyToIndexMapping[targetKey]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && !!value && !Array.isArray(value)
}

/**
 * Simplify returns `null` if the value given was `undefined`. This behavior
 * is the same as how `JSON.stringify` works so this is relatively expected
 * behavior.
 */
function nullifyUndefined(item: unknown) {
  if (item === undefined) return null
  return item
}

function yes(_: unknown) {
  return true
}
