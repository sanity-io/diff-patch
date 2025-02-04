import {cleanupEfficiency, makeDiff, makePatches, stringifyPatches} from '@sanity/diff-match-patch'
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

const ignoredKeys = ['_id', '_type', '_createdAt', '_updatedAt', '_rev']

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
 * Options for the diff-match-patch algorithm.
 *
 * @public
 */
export interface DiffMatchPatchOptions {
  /**
   * Whether or not to use diff-match-patch at all
   *
   * @defaultValue `true`
   */
  enabled: boolean

  /**
   * Threshold at which to start using diff-match-patch instead of a regular `set` patch.
   *
   * @defaultValue `30`
   */
  lengthThresholdAbsolute: number

  /**
   * Only use generated diff-match-patch if the patch length is less than or equal to
   * (targetString * relative). Example: A 100 character target with a relative factor
   * of 1.2 will allow a 120 character diff-match-patch. If larger than this number,
   * it will fall back to a regular `set` patch.
   *
   * @defaultValue `1.2`
   */
  lengthThresholdRelative: number
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

  /**
   * Options for the diff-match-patch algorithm.
   */
  diffMatchPatch?: Partial<DiffMatchPatchOptions>
}

/**
 * Options for diff generation, where all DMP properties are required
 *
 * @public
 */
export type DiffOptions = PatchOptions & {diffMatchPatch: Required<DiffMatchPatchOptions>}

const defaultOptions = {
  hideWarnings: false,
  diffMatchPatch: {
    enabled: true,

    // Only use diff-match-patch if target string is longer than this threshold
    lengthThresholdAbsolute: 30,

    // Only use generated diff-match-patch if the patch length is less than or equal to
    // (targetString * relative). Example: A 100 character target with a relative factor
    // of 1.2 will allow a 120 character diff-match-patch. If larger than this number,
    // it will fall back to a regular `set` patch.
    lengthThresholdRelative: 1.2,
  },
} satisfies DiffOptions

/**
 * Merges the default options with the passed in options.
 *
 * @param options - Options to merge with the defaults
 * @returns Merged options
 */
function mergeOptions(options: PatchOptions): DiffOptions {
  return {
    ...defaultOptions,
    ...options,
    diffMatchPatch: {...defaultOptions.diffMatchPatch, ...(options.diffMatchPatch || {})},
  }
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
  opts?: PatchOptions,
): SanityPatchMutation[] {
  const options = mergeOptions(opts || {})
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
  opts: DiffOptions = defaultOptions,
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

  const options = mergeOptions(opts)
  const dataType = aIsUndefined ? bType : aType
  const isContainer = dataType === 'object' || dataType === 'array'
  if (!isContainer) {
    return diffPrimitive(itemA as PrimitiveValue, itemB as PrimitiveValue, options, path, patches)
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
  options: DiffOptions,
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
  options: DiffOptions,
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

    // If we're revision locked, we can safely unset ranges (eg 5:<end-of-array>).
    // Also, if we don't have unique array keys, we can't use any better approach
    // than array indexes. If we _do_ have unique array keys, we'll want to unset
    // by key, as this is safer in a realtime, collaborative setting
    if (isRevisionLocked(options) || !isUniquelyKeyed(unsetItems)) {
      patches.push({
        op: 'unset',
        path: path.concat([isSingle ? itemB.length : [itemB.length, '']]),
      })
    } else {
      patches.push(
        ...unsetItems.map(
          (item): UnsetPatch => ({op: 'unset', path: path.concat({_key: item._key})}),
        ),
      )
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
  options: DiffOptions,
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
  options: DiffOptions,
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

function getDiffMatchPatch(
  itemA: PrimitiveValue,
  itemB: PrimitiveValue,
  options: DiffOptions,
  path: Path,
): DiffMatchPatch | undefined {
  const {enabled, lengthThresholdRelative, lengthThresholdAbsolute} = options.diffMatchPatch
  const segment = path[path.length - 1]
  if (
    !enabled ||
    // Don't use for anything but strings
    typeof itemA !== 'string' ||
    typeof itemB !== 'string' ||
    // Don't use for `_key`, `_ref` etc
    (typeof segment === 'string' && segment[0] === '_') ||
    // Don't use on short strings
    itemB.length < lengthThresholdAbsolute
  ) {
    return undefined
  }

  let strPatch = ''
  try {
    const patch = makeDiff(itemA, itemB)
    const diff = cleanupEfficiency(patch)
    strPatch = stringifyPatches(makePatches(diff))
  } catch (err) {
    // Fall back to using regular set patch
    return undefined
  }

  // Don't use patch if it's longer than allowed relative threshold.
  // Allow a 120 character patch for a 100 character string,
  // but don't allow a 800 character patch for a 500 character value.
  return strPatch.length > itemB.length * lengthThresholdRelative
    ? undefined
    : {op: 'diffMatchPatch', path, value: strPatch}
}

function diffPrimitive(
  itemA: PrimitiveValue,
  itemB: PrimitiveValue,
  options: DiffOptions,
  path: Path,
  patches: Patch[],
): Patch[] {
  const dmp = getDiffMatchPatch(itemA, itemB, options, path)

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
  return ignoredKeys.indexOf(key) === -1
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

function isRevisionLocked(options: PatchOptions): boolean {
  return Boolean(options.ifRevisionID)
}

function yes(_: unknown) {
  return true
}
