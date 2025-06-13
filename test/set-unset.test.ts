import {describe, test, expect} from 'vitest'
import {diffPatch} from '../src'
import * as deep from './fixtures/deep'
import * as image from './fixtures/image'
import * as nested from './fixtures/nested'
import * as setAndUnset from './fixtures/set-and-unset'
import * as simple from './fixtures/simple'

describe('set/unset', () => {
  test('simple root-level changes', () => {
    expect(diffPatch(simple.a, simple.b)).toMatchSnapshot()
  })

  test('basic nested changes', () => {
    expect(diffPatch(nested.a, nested.b)).toMatchSnapshot()
  })

  test('set + unset, nested changes', () => {
    expect(diffPatch(setAndUnset.a, setAndUnset.b)).toMatchSnapshot()
  })

  test('set + unset, image example', () => {
    expect(diffPatch(image.a, image.b)).toMatchSnapshot()
  })

  test('deep nested changes', () => {
    expect(diffPatch(deep.a, deep.b)).toMatchSnapshot()
  })

  test('no diff', () => {
    expect(diffPatch(nested.a, nested.a)).toEqual([])
  })
})
