import {Mutation} from '@sanity/mutator'
import type {SanityPatchMutation} from '../../src'

type Doc = {_id: string; _type: string; [key: string]: unknown}

export function applySeparately(doc: Doc, mutations: SanityPatchMutation[]): unknown {
  return mutations.reduce<Doc | null>(
    (current, mutation) => new Mutation({mutations: [mutation]}).apply(current) as Doc | null,
    doc,
  )
}

export function applyAsTransaction(doc: Doc, mutations: SanityPatchMutation[]): unknown {
  return new Mutation({mutations}).apply(doc)
}

export function summarize(mutations: SanityPatchMutation[]): string[] {
  return mutations.flatMap(({patch}) => {
    const lines: string[] = []
    for (const path of Object.keys(patch.set ?? {})) lines.push(`set ${path}`)
    for (const path of patch.unset ?? []) lines.push(`unset ${path}`)
    if (patch.insert) {
      const {items, ...position} = patch.insert
      const [where, path] = Object.entries(position)[0]
      const keys = items.map((item) => (item as {_key: string})._key).join(',')
      lines.push(`insert ${keys} ${where} ${path}`)
    }
    for (const path of Object.keys(patch.diffMatchPatch ?? {})) lines.push(`diffMatchPatch ${path}`)
    return lines
  })
}
