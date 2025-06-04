import {describe, test, expect} from 'vitest'
import {diffPatch} from '../src'
import * as deep from './fixtures/deep'
import * as image from './fixtures/image'
import * as nested from './fixtures/nested'
import * as setAndUnset from './fixtures/set-and-unset'
import * as simple from './fixtures/simple'
import {applyPatches} from './helpers/applyPatches'

describe('set/unset', () => {
  test('simple root-level changes', () => {
    const patches = diffPatch(simple.a, simple.b)
    expect(patches).toMatchSnapshot()
    expect(applyPatches(simple.a, patches)).toEqual({
      ...simple.b,
      // some of the fields are expected not to change since they're at the root
      _createdAt: simple.a._createdAt,
      _updatedAt: simple.a._updatedAt,
      _rev: simple.a._rev,
    })
  })

  test('basic nested changes', () => {
    const patches = diffPatch(nested.a, nested.b)
    expect(patches).toMatchSnapshot()
    expect(applyPatches(nested.a, patches)).toEqual(nested.b)
  })

  test('set + unset, nested changes', () => {
    const patches = diffPatch(setAndUnset.a, setAndUnset.b)
    expect(patches).toMatchSnapshot()
    expect(applyPatches(setAndUnset.a, patches)).toEqual(setAndUnset.b)
  })

  test('set + unset, image example', () => {
    const patches = diffPatch(image.a, image.b)
    expect(patches).toMatchSnapshot()
    expect(applyPatches(image.a, patches)).toEqual(image.b)
  })

  test('deep nested changes', () => {
    const patches = diffPatch(deep.a, deep.b)
    expect(patches).toMatchSnapshot()
    expect(applyPatches(deep.a, patches)).toEqual(deep.b)
  })

  test('no diff', () => {
    const patches = diffPatch(nested.a, nested.a)
    expect(patches).toEqual([])
    expect(applyPatches(nested.a, patches)).toEqual(nested.a)
  })
})
