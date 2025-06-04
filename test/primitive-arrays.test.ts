import {describe, test, expect} from 'vitest'
import {diffPatch} from '../src'
import * as primitiveArrayAdd from './fixtures/primitive-array-add'
import * as primitiveArrayRemove from './fixtures/primitive-array-remove'
import {applyPatches} from './helpers/applyPatches'

describe('primitive arrays', () => {
  test('add to end (single)', () => {
    const patches = diffPatch(primitiveArrayAdd.a, primitiveArrayAdd.b)
    expect(patches).toMatchSnapshot()
    expect(applyPatches(primitiveArrayAdd.a, patches)).toEqual(primitiveArrayAdd.b)
  })

  test('add to end (multiple)', () => {
    const patches = diffPatch(primitiveArrayAdd.a, primitiveArrayAdd.c)
    expect(patches).toMatchSnapshot()
    expect(applyPatches(primitiveArrayAdd.a, patches)).toEqual(primitiveArrayAdd.c)
  })

  test('remove from end (single)', () => {
    const patches = diffPatch(primitiveArrayRemove.a, primitiveArrayRemove.b)
    expect(patches).toMatchSnapshot()
    expect(applyPatches(primitiveArrayRemove.a, patches)).toEqual(primitiveArrayRemove.b)
  })

  test('remove from end (multiple)', () => {
    const patches = diffPatch(primitiveArrayRemove.a, primitiveArrayRemove.c)
    expect(patches).toMatchSnapshot()
    expect(applyPatches(primitiveArrayRemove.a, patches)).toEqual(primitiveArrayRemove.c)
  })

  test('remove from middle (single)', () => {
    const patches = diffPatch(primitiveArrayRemove.a, primitiveArrayRemove.d)
    expect(patches).toMatchSnapshot()
    expect(applyPatches(primitiveArrayRemove.a, patches)).toEqual(primitiveArrayRemove.d)
  })
})
