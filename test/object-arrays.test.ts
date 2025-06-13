import {describe, test, expect} from 'vitest'
import {diffPatch} from '../src'
import * as objectArrayAdd from './fixtures/object-array-add'
import * as objectArrayRemove from './fixtures/object-array-remove'
import * as objectArrayChange from './fixtures/object-array-change'
import * as objectArrayReorder from './fixtures/object-array-reorder'

describe('object arrays', () => {
  test('change item', () => {
    expect(diffPatch(objectArrayChange.a, objectArrayChange.b)).toMatchSnapshot()
  })

  test('add to end (single)', () => {
    expect(diffPatch(objectArrayAdd.a, objectArrayAdd.b)).toMatchSnapshot()
  })

  test('add to end (multiple)', () => {
    expect(diffPatch(objectArrayAdd.a, objectArrayAdd.c)).toMatchSnapshot()
  })

  test('remove from end (single)', () => {
    expect(diffPatch(objectArrayRemove.a, objectArrayRemove.b)).toMatchSnapshot()
  })

  test('remove from end (multiple)', () => {
    expect(diffPatch(objectArrayRemove.a, objectArrayRemove.c)).toMatchSnapshot()
  })

  test('remove from middle (single)', () => {
    expect(diffPatch(objectArrayRemove.a, objectArrayRemove.d)).toMatchSnapshot()
  })

  test('reorder (simple swap)', () => {
    expect(diffPatch(objectArrayReorder.a, objectArrayReorder.b)).toMatchSnapshot()
  })

  test('reorder (complete reverse)', () => {
    expect(diffPatch(objectArrayReorder.a, objectArrayReorder.c)).toMatchSnapshot()
  })

  test('reorder with content change', () => {
    expect(diffPatch(objectArrayReorder.a, objectArrayReorder.d)).toMatchSnapshot()
  })

  test('reorder with insertion and deletion', () => {
    expect(diffPatch(objectArrayReorder.a, objectArrayReorder.e)).toMatchSnapshot()
  })

  test('reorder with size change (multiple insertions)', () => {
    expect(diffPatch(objectArrayReorder.a, objectArrayReorder.f)).toMatchSnapshot()
  })
})
