import {describe, test, expect} from 'vitest'
import {diffPatch} from '../src'
import * as objectArrayAdd from './fixtures/object-array-add'
import * as objectArrayRemove from './fixtures/object-array-remove'
import * as objectArrayChange from './fixtures/object-array-change'
import {applyPatches} from './helpers/applyPatches'

describe('object arrays', () => {
  test('change item', () => {
    const patches = diffPatch(objectArrayChange.a, objectArrayChange.b)
    expect(patches).toMatchSnapshot()
    expect(applyPatches(objectArrayChange.a, patches)).toEqual(objectArrayChange.b)
  })

  test('add to end (single)', () => {
    const patches = diffPatch(objectArrayAdd.a, objectArrayAdd.b)
    expect(patches).toMatchSnapshot()
    expect(applyPatches(objectArrayAdd.a, patches)).toEqual(objectArrayAdd.b)
  })

  test('add to end (multiple)', () => {
    const patches = diffPatch(objectArrayAdd.a, objectArrayAdd.c)
    expect(patches).toMatchSnapshot()
    expect(applyPatches(objectArrayAdd.a, patches)).toEqual(objectArrayAdd.c)
  })

  test('remove from end (single)', () => {
    const patches = diffPatch(objectArrayRemove.a, objectArrayRemove.b)
    expect(patches).toMatchSnapshot()
    expect(applyPatches(objectArrayRemove.a, patches)).toEqual(objectArrayRemove.b)
  })

  test('remove from end (multiple)', () => {
    const patches = diffPatch(objectArrayRemove.a, objectArrayRemove.c)
    expect(patches).toMatchSnapshot()
    expect(applyPatches(objectArrayRemove.a, patches)).toEqual(objectArrayRemove.c)
  })

  test('remove from middle (single)', () => {
    const patches = diffPatch(objectArrayRemove.a, objectArrayRemove.d)
    expect(patches).toMatchSnapshot()
    expect(applyPatches(objectArrayRemove.a, patches)).toEqual(objectArrayRemove.d)
  })
})
