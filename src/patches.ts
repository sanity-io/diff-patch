import type {KeyedSanityObject, Path} from './paths.js'

/**
 * A `set` operation
 * Replaces the current path, does not merge
 *
 * @internal
 */
export interface SetPatch {
  op: 'set'
  path: Path
  value: unknown
}

/**
 * A `unset` operation
 * Unsets the entire value of the given path
 *
 * @internal
 */
export interface UnsetPatch {
  op: 'unset'
  path: Path
}

/**
 * A `insert` operation
 * Inserts the given items _after_ the given path
 *
 * @internal
 */
export interface InsertPatch {
  op: 'insert'
  position: 'before' | 'after' | 'replace'
  path: Path
  items: any[]
}

/**
 * A `diffMatchPatch` operation
 * Applies the given `value` (unidiff format) to the given path. Must be a string.
 *
 * @internal
 */
export interface DiffMatchPatch {
  op: 'diffMatchPatch'
  path: Path
  value: string
}

/**
 * A `reorder` operation used to ...
 *
 * Note: NOT a serializable mutation.
 *
 * @public
 */
export interface ReorderPatch {
  op: 'reorder'
  path: Path
  snapshot: KeyedSanityObject[]
  reorders: {sourceKey: string; targetKey: string}[]
}

/**
 * Internal patch representation used during diff generation
 *
 * @internal
 */
export type Patch = SetPatch | UnsetPatch | InsertPatch | DiffMatchPatch | ReorderPatch

/**
 * A Sanity `set` patch mutation operation
 * Replaces the current path, does not merge
 *
 * @public
 */
export interface SanitySetPatchOperation {
  set: Record<string, unknown>
}

/**
 * A Sanity `unset` patch mutation operation
 * Unsets the entire value of the given path
 *
 * @public
 */
export interface SanityUnsetPatchOperation {
  unset: string[]
}

/**
 * A Sanity `insert` patch mutation operation
 * Inserts the given items at the given path (before/after)
 *
 * @public
 */
export interface SanityInsertPatchOperation {
  insert:
    | {before: string; items: unknown[]}
    | {after: string; items: unknown[]}
    | {replace: string; items: unknown[]}
}

/**
 * A Sanity `diffMatchPatch` patch mutation operation
 * Patches the given path with the given unidiff string.
 *
 * @public
 */
export interface SanityDiffMatchPatchOperation {
  diffMatchPatch: Record<string, string>
}

/**
 * Serializable patch operations that can be applied to a Sanity document.
 *
 * @public
 */
export type SanityPatchOperations = Partial<
  SanitySetPatchOperation &
    SanityUnsetPatchOperation &
    SanityInsertPatchOperation &
    SanityDiffMatchPatchOperation
>

/**
 * Meant to be used as the body of a {@link SanityPatchMutation}'s `patch` key.
 *
 * Contains additional properties to target a particular ID and optionally add
 * an optimistic lock via [`ifRevisionID`](https://www.sanity.io/docs/content-lake/transactions#k29b2c75639d5).
 *
 * @public
 */
export interface SanityPatch extends SanityPatchOperations {
  id: string
  ifRevisionID?: string
}

/**
 * A mutation containing a single patch
 *
 * @public
 */
export interface SanityPatchMutation {
  patch: SanityPatch
}
