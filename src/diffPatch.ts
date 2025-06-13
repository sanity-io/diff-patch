import {makePatches, stringifyPatches} from '@sanity/diff-match-patch'
import {DiffError} from './diffError.js'
import {type Path, pathToString} from './paths.js'
import {validateProperty} from './validate.js'
import {
  type Patch,
  type SetPatch,
  type UnsetPatch,
  type InsertAfterPatch,
  type DiffMatchPatch,
  type SanityInsertPatch,
  type SanityPatch,
  type SanitySetPatch,
  type SanityUnsetPatch,
  type SanityDiffMatchPatch,
  type SanityPatchMutation,
} from './patches.js'

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

const DEFAULT_OPTIONS: PatchOptions = {
  hideWarnings: false,
}

type PrimitiveValue = string | number | boolean | null | undefined

/**
 * An object (record) that has a `_key` property
 *
 * @internal
 */
export interface KeyedSanityObject {
  [key: string]: unknown
  _key: string
}

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

  /**
   * Whether or not to hide warnings during the diff process.
   *
   * @defaultValue `false`
   */
  hideWarnings?: boolean
}

/**
 * Generates an array of mutations for Sanity, based on the differences between
 * the two passed documents/trees.
 *
 * @param itemA - The first document/tree to compare
 * @param itemB - The second document/tree to compare
 * @param opts - Options for the diff generation
 * @returns Array of mutations
 * @public
 */
export function diffPatch(
  itemA: DocumentStub,
  itemB: DocumentStub,
  options: PatchOptions = {},
): SanityPatchMutation[] {
  const id = options.id || (itemA._id === itemB._id && itemA._id)
  const revisionLocked = options.ifRevisionID
  const ifRevisionID = typeof revisionLocked === 'boolean' ? itemA._rev : revisionLocked
  const basePath = options.basePath || []
  if (!id) {
    throw new Error(
      '_id on itemA and itemB not present or differs, specify document id the mutations should be applied to',
    )
  }

  if (revisionLocked === true && !ifRevisionID) {
    throw new Error(
      '`ifRevisionID` is set to `true`, but no `_rev` was passed in item A. Either explicitly set `ifRevisionID` to a revision, or pass `_rev` as part of item A.',
    )
  }

  if (basePath.length === 0 && itemA._type !== itemB._type) {
    throw new Error(`_type is immutable and cannot be changed (${itemA._type} => ${itemB._type})`)
  }

  const operations = diffItem(itemA, itemB, options, basePath, [])
  return serializePatches(operations, {id, ifRevisionID: revisionLocked ? ifRevisionID : undefined})
}

/**
 * Diffs two items and returns an array of patches.
 * Note that this is different from `diffPatch`, which generates _mutations_.
 *
 * @param itemA - The first item to compare
 * @param itemB - The second item to compare
 * @param opts - Options for the diff generation
 * @param path - Path to the current item
 * @param patches - Array of patches to append the results to. Note that this is MUTATED.
 * @returns Array of patches
 * @public
 */
export function diffItem(
  itemA: unknown,
  itemB: unknown,
  options = DEFAULT_OPTIONS,
  path: Path = [],
  patches: Patch[] = [],
): Patch[] {
  if (itemA === itemB) {
    return patches
  }

  const aType = Array.isArray(itemA) ? 'array' : typeof itemA
  const bType = Array.isArray(itemB) ? 'array' : typeof itemB

  const aIsUndefined = aType === 'undefined'
  const bIsUndefined = bType === 'undefined'

  if (aIsUndefined && !bIsUndefined) {
    patches.push({op: 'set', path, value: itemB})
    return patches
  }

  if (!aIsUndefined && bIsUndefined) {
    patches.push({op: 'unset', path})
    return patches
  }

  const dataType = aIsUndefined ? bType : aType
  const isContainer = dataType === 'object' || dataType === 'array'
  if (!isContainer) {
    return diffPrimitive(itemA as PrimitiveValue, itemB as PrimitiveValue, path, patches)
  }

  if (aType !== bType) {
    // Array => Object / Object => Array
    patches.push({op: 'set', path, value: itemB})
    return patches
  }

  return dataType === 'array'
    ? diffArray(itemA as unknown[], itemB as unknown[], options, path, patches)
    : diffObject(itemA as object, itemB as object, options, path, patches)
}

function diffObject(
  itemA: SanityObject,
  itemB: SanityObject,
  options: PatchOptions,
  path: Path,
  patches: Patch[],
) {
  const atRoot = path.length === 0
  const aKeys = Object.keys(itemA)
    .filter(atRoot ? isNotIgnoredKey : yes)
    .map((key) => validateProperty(key, itemA[key], path))

  const aKeysLength = aKeys.length
  const bKeys = Object.keys(itemB)
    .filter(atRoot ? isNotIgnoredKey : yes)
    .map((key) => validateProperty(key, itemB[key], path))

  const bKeysLength = bKeys.length

  // Check for deleted items
  for (let i = 0; i < aKeysLength; i++) {
    const key = aKeys[i]
    if (!(key in itemB)) {
      patches.push({op: 'unset', path: path.concat(key)})
    }
  }

  // Check for changed items
  for (let i = 0; i < bKeysLength; i++) {
    const key = bKeys[i]
    diffItem(itemA[key], itemB[key], options, path.concat([key]), patches)
  }

  return patches
}

function diffArray(
  itemA: unknown[],
  itemB: unknown[],
  options: PatchOptions,
  path: Path,
  patches: Patch[],
) {
  // Check for new items
  if (itemB.length > itemA.length) {
    patches.push({
      op: 'insert',
      after: path.concat([-1]),
      items: itemB.slice(itemA.length).map((item, i) => nullifyUndefined(item, path, i, options)),
    })
  }

  // Check for deleted items
  if (itemB.length < itemA.length) {
    const isSingle = itemA.length - itemB.length === 1
    const unsetItems = itemA.slice(itemB.length)

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
        path: path.concat([isSingle ? itemB.length : [itemB.length, '']]),
      })
    }
  }

  // Check for illegal array contents
  for (let i = 0; i < itemB.length; i++) {
    if (Array.isArray(itemB[i])) {
      throw new DiffError('Multi-dimensional arrays not supported', path.concat(i), itemB[i])
    }
  }

  const overlapping = Math.min(itemA.length, itemB.length)
  const segmentA = itemA.slice(0, overlapping)
  const segmentB = itemB.slice(0, overlapping)

  return isUniquelyKeyed(segmentA) && isUniquelyKeyed(segmentB)
    ? diffArrayByKey(segmentA, segmentB, options, path, patches)
    : diffArrayByIndex(segmentA, segmentB, options, path, patches)
}

function diffArrayByIndex(
  itemA: unknown[],
  itemB: unknown[],
  options: PatchOptions,
  path: Path,
  patches: Patch[],
) {
  for (let i = 0; i < itemA.length; i++) {
    diffItem(
      itemA[i],
      nullifyUndefined(itemB[i], path, i, options),
      options,
      path.concat(i),
      patches,
    )
  }

  return patches
}

function diffArrayByKey(
  itemA: KeyedSanityObject[],
  itemB: KeyedSanityObject[],
  options: PatchOptions,
  path: Path,
  patches: Patch[],
) {
  const keyedA = indexByKey(itemA)
  const keyedB = indexByKey(itemB)

  // There's a bunch of hard/semi-hard problems related to using keys
  // Unless we have the exact same order, just use indexes for now
  if (!arrayIsEqual(keyedA.keys, keyedB.keys)) {
    return diffArrayByIndex(itemA, itemB, options, path, patches)
  }

  for (let i = 0; i < keyedB.keys.length; i++) {
    const key = keyedB.keys[i]
    const valueA = keyedA.index[key]
    const valueB = nullifyUndefined(keyedB.index[key], path, i, options)
    diffItem(valueA, valueB, options, path.concat({_key: key}), patches)
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

function getDiffMatchPatch(
  source: PrimitiveValue,
  target: PrimitiveValue,
  path: Path,
): DiffMatchPatch | undefined {
  if (typeof source !== 'string' || typeof target !== 'string') return undefined
  const last = path.at(-1)
  // don't use diff-match-patch for system keys
  if (typeof last === 'string' && last.startsWith('_')) return undefined
  if (!shouldUseDiffMatchPatch(source, target)) return undefined

  try {
    // Using `makePatches(string, string)` directly instead of the multi-step approach e.g.
    // `stringifyPatches(makePatches(cleanupEfficiency(makeDiff(itemA, itemB))))`.
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

function diffPrimitive(
  itemA: PrimitiveValue,
  itemB: PrimitiveValue,
  path: Path,
  patches: Patch[],
): Patch[] {
  const dmp = getDiffMatchPatch(itemA, itemB, path)

  patches.push(
    dmp || {
      op: 'set',
      path,
      value: itemB,
    },
  )

  return patches
}

function isNotIgnoredKey(key: string) {
  return SYSTEM_KEYS.indexOf(key) === -1
}

function serializePatches(
  patches: Patch[],
  options: {id: string; ifRevisionID?: string},
): SanityPatchMutation[] {
  if (patches.length === 0) {
    return []
  }

  const {id, ifRevisionID} = options
  const set = patches.filter((patch): patch is SetPatch => patch.op === 'set')
  const unset = patches.filter((patch): patch is UnsetPatch => patch.op === 'unset')
  const insert = patches.filter((patch): patch is InsertAfterPatch => patch.op === 'insert')
  const dmp = patches.filter((patch): patch is DiffMatchPatch => patch.op === 'diffMatchPatch')

  const withSet =
    set.length > 0 &&
    set.reduce(
      (patch: SanitySetPatch, item: SetPatch) => {
        const path = pathToString(item.path)
        patch.set[path] = item.value
        return patch
      },
      {id, set: {}},
    )

  const withUnset =
    unset.length > 0 &&
    unset.reduce(
      (patch: SanityUnsetPatch, item: UnsetPatch) => {
        const path = pathToString(item.path)
        patch.unset.push(path)
        return patch
      },
      {id, unset: []},
    )

  const withInsert = insert.reduce((acc: SanityInsertPatch[], item: InsertAfterPatch) => {
    const after = pathToString(item.after)
    return acc.concat({id, insert: {after, items: item.items}})
  }, [])

  const withDmp =
    dmp.length > 0 &&
    dmp.reduce(
      (patch: SanityDiffMatchPatch, item: DiffMatchPatch) => {
        const path = pathToString(item.path)
        patch.diffMatchPatch[path] = item.value
        return patch
      },
      {id, diffMatchPatch: {}},
    )

  const patchSet: SanityPatch[] = [withUnset, withSet, withDmp, ...withInsert].filter(
    (item): item is SanityPatch => item !== false,
  )

  return patchSet.map((patch, i) => ({
    patch: ifRevisionID && i === 0 ? {...patch, ifRevisionID} : patch,
  }))
}

function isUniquelyKeyed(arr: unknown[]): arr is KeyedSanityObject[] {
  const keys = []

  for (let i = 0; i < arr.length; i++) {
    const key = getKey(arr[i])
    if (!key || keys.indexOf(key) !== -1) {
      return false
    }

    keys.push(key)
  }

  return true
}

function getKey(obj: unknown) {
  return typeof obj === 'object' && obj !== null && (obj as KeyedSanityObject)._key
}

function indexByKey(arr: KeyedSanityObject[]) {
  return arr.reduce(
    (acc, item) => {
      acc.keys.push(item._key)
      acc.index[item._key] = item
      return acc
    },
    {keys: [] as string[], index: {} as {[key: string]: KeyedSanityObject}},
  )
}

function arrayIsEqual(itemA: unknown[], itemB: unknown[]) {
  return itemA.length === itemB.length && itemA.every((item, i) => itemB[i] === item)
}

function nullifyUndefined(item: unknown, path: Path, index: number, options: PatchOptions) {
  if (typeof item !== 'undefined') {
    return item
  }

  if (!options.hideWarnings) {
    const serializedPath = pathToString(path.concat(index))
    console.warn(`undefined value in array converted to null (at '${serializedPath}')`)
  }

  return null
}

function yes(_: unknown) {
  return true
}
