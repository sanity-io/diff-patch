import {describe, test, expect} from 'vitest'
import {diffPatch} from '../src'
import * as move from './fixtures/object-array-move'
import {applyAsTransaction, applySeparately, summarize} from './helpers/applyPatches'

function diffAndApply(target: typeof move.source) {
  const patches = diffPatch(move.source, target)
  expect(applySeparately(move.source, patches)).toEqual(target)
  expect(applyAsTransaction(move.source, patches)).toEqual(target)
  return patches
}

describe('object array moves', () => {
  test('moving the last item to the top touches only that item', () => {
    const patches = diffAndApply(move.lastToTop)
    expect(summarize(patches)).toEqual([
      'unset body[_key=="e1"]',
      'insert e1 before body[_key=="a1"]',
    ])
    expect(patches).toMatchSnapshot()
  })

  test('swapping two neighbours moves one of them', () => {
    const patches = diffAndApply(move.swapNeighbours)
    expect(summarize(patches)).toEqual([
      'unset body[_key=="b1"]',
      'insert b1 after body[_key=="c1"]',
    ])
    expect(patches).toMatchSnapshot()
  })

  test('moving the first item to the end touches only that item', () => {
    const patches = diffAndApply(move.firstToEnd)
    expect(summarize(patches)).toEqual([
      'unset body[_key=="a1"]',
      'insert a1 after body[_key=="e1"]',
    ])
    expect(patches).toMatchSnapshot()
  })

  test('a move keeps the text diff of a stable item', () => {
    const patches = diffAndApply(move.moveWithStableEdit)
    expect(summarize(patches)).toEqual([
      'diffMatchPatch body[_key=="b1"].text',
      'unset body[_key=="e1"]',
      'insert e1 before body[_key=="a1"]',
    ])
    expect(patches).toMatchSnapshot()
  })

  test('a move combined with an added and a removed item', () => {
    const patches = diffAndApply(move.moveWithAddAndRemove)
    expect(summarize(patches)).toEqual([
      'unset body[_key=="c1"]',
      'unset body[_key=="e1"]',
      'insert e1 before body[_key=="a1"]',
      'insert f1 after body[_key=="a1"]',
    ])
    expect(patches).toMatchSnapshot()
  })

  test('a moved item carries its changed content in the insert', () => {
    const patches = diffAndApply(move.moveWithChangedContent)
    expect(summarize(patches)).toEqual([
      'unset body[_key=="e1"]',
      'insert e1 before body[_key=="a1"]',
    ])
    expect(patches).toMatchSnapshot()
  })

  test('a moved item still rejects multidimensional arrays', () => {
    expect(() =>
      diffPatch(
        {_id: 'doc', _type: 'post', body: [{_key: 'a1'}, {_key: 'b1'}, {_key: 'c1', values: [1]}]},
        {
          _id: 'doc',
          _type: 'post',
          body: [{_key: 'c1', values: [[1]]}, {_key: 'a1'}, {_key: 'b1'}],
        },
      ),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Multi-dimensional arrays not supported (at 'body[_key=="c1"].values[0]')]`,
    )
  })

  test('a moved item still rejects invalid property names', () => {
    expect(() =>
      diffPatch(
        {_id: 'doc', _type: 'post', body: [{_key: 'a1'}, {_key: 'b1'}, {_key: 'c1'}]},
        {_id: 'doc', _type: 'post', body: [{_key: 'c1', '1st': true}, {_key: 'a1'}, {_key: 'b1'}]},
      ),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Keys must start with a letter (a-z) (at 'body[_key=="c1"]['1st']')]`,
    )
  })
})
