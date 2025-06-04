import type {DocumentStub} from '../../src/diffPatch.js'
import type {SanityPatchMutation} from '../../src/patches.js'
import {ifRevisionID, set, unset, insert, diffMatchPatch} from './patchOperations.js'

const operations = {
  ifRevisionID,
  set,
  unset,
  insert,
  diffMatchPatch,
}

export function applyPatches(source: DocumentStub, patches: SanityPatchMutation[]): DocumentStub {
  let target = source

  for (const {patch} of patches) {
    const {id, ...patchOperations} = patch

    for (const [op, fn] of Object.entries(operations)) {
      if (patchOperations[op]) {
        target = fn(target, patchOperations[op])
      }
    }
  }

  return target
}
