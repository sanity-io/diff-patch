import {describe, test, expect} from 'vitest'
import {diffPatch} from '../src'
import * as simple from './fixtures/simple'

describe('ifRevisionID', () => {
  test('can apply revision constraint (uppercase)', () => {
    expect(diffPatch(simple.a, simple.b, {ifRevisionID: 'abc123'})).toMatchSnapshot()
  })

  test('can apply revision constraint (inferred from document)', () => {
    expect(diffPatch(simple.a, simple.b, {ifRevisionID: true})).toMatchSnapshot()
  })

  test('throws if revision constraint is `true` but no `_rev` is given', () => {
    const doc = {...simple.a, _rev: undefined}
    expect(() => diffPatch(doc, simple.b, {ifRevisionID: true})).toThrowErrorMatchingInlineSnapshot(
      `[Error: \`ifRevisionID\` is set to \`true\`, but no \`_rev\` was passed in item A. Either explicitly set \`ifRevisionID\` to a revision, or pass \`_rev\` as part of item A.]`,
    )
  })
})
