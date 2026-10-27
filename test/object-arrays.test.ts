import {Mutation} from '@sanity/mutator'
import {describe, test, expect} from 'vitest'
import {diffPatch} from '../src'
import * as objectArrayAdd from './fixtures/object-array-add'
import * as objectArrayRemove from './fixtures/object-array-remove'
import * as objectArrayChange from './fixtures/object-array-change'
import * as objectArrayReorder from './fixtures/object-array-reorder'

const id = 'keys'
const keys = ['a', 'bad key!', 'q"uote', 'back\\slash', 'bra]cket', 'q"uote\\back']

function doc(items: {_key: string; text: string}[]) {
  return {_id: id, _type: 'test', items}
}

function apply(source: {_id: string}, target: {_id: string}) {
  const mutations = diffPatch(source, target)
  return new Mutation({mutations}).apply(source as any)
}

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

  describe('keys needing escaping', () => {
    test('one-character key', () => {
      expect(diffPatch(doc([{_key: 'a', text: 'foo'}]), doc([{_key: 'a', text: 'bar'}])))
        .toMatchInlineSnapshot(`
          [
            {
              "patch": {
                "diffMatchPatch": {
                  "items[_key=="a"].text": "@@ -1,3 +1,3 @@
          -foo
          +bar
          ",
                },
                "id": "keys",
              },
            },
          ]
        `)
    })

    test('key with space', () => {
      expect(
        diffPatch(doc([{_key: 'bad key!', text: 'foo'}]), doc([{_key: 'bad key!', text: 'bar'}])),
      ).toMatchInlineSnapshot(`
        [
          {
            "patch": {
              "diffMatchPatch": {
                "items[_key=="bad key!"].text": "@@ -1,3 +1,3 @@
        -foo
        +bar
        ",
              },
              "id": "keys",
            },
          },
        ]
      `)
    })

    test('key with double quote', () => {
      expect(diffPatch(doc([{_key: 'q"uote', text: 'foo'}]), doc([{_key: 'q"uote', text: 'bar'}])))
        .toMatchInlineSnapshot(`
          [
            {
              "patch": {
                "diffMatchPatch": {
                  "items[_key=="q\\"uote"].text": "@@ -1,3 +1,3 @@
          -foo
          +bar
          ",
                },
                "id": "keys",
              },
            },
          ]
        `)
    })

    test('key with backslash', () => {
      expect(
        diffPatch(
          doc([{_key: 'back\\slash', text: 'foo'}]),
          doc([{_key: 'back\\slash', text: 'bar'}]),
        ),
      ).toMatchInlineSnapshot(`
        [
          {
            "patch": {
              "diffMatchPatch": {
                "items[_key=="back\\\\slash"].text": "@@ -1,3 +1,3 @@
        -foo
        +bar
        ",
              },
              "id": "keys",
            },
          },
        ]
      `)
    })

    test('key with closing bracket', () => {
      expect(
        diffPatch(doc([{_key: 'bra]cket', text: 'foo'}]), doc([{_key: 'bra]cket', text: 'bar'}])),
      ).toMatchInlineSnapshot(`
        [
          {
            "patch": {
              "diffMatchPatch": {
                "items[_key=="bra]cket"].text": "@@ -1,3 +1,3 @@
        -foo
        +bar
        ",
              },
              "id": "keys",
            },
          },
        ]
      `)
    })

    test('applied patches produce the target for text changes', () => {
      const source = doc(keys.map((_key) => ({_key, text: `text for ${_key}`})))
      const target = doc(keys.map((_key) => ({_key, text: `new text for ${_key}`})))
      expect(apply(source, target)).toEqual(target)
    })

    test('applied patches produce the target for insert, unset and reorder', () => {
      const source = doc(keys.map((_key) => ({_key, text: _key})))
      const inserted = doc([
        ...source.items.slice(0, 3),
        {_key: 'new"\\one', text: 'new'},
        ...source.items.slice(3),
      ])
      const removed = doc(source.items.filter(({_key}) => _key !== 'q"uote'))
      const reversed = doc([...source.items].reverse())

      expect(apply(source, inserted)).toEqual(inserted)
      expect(apply(source, removed)).toEqual(removed)
      expect(apply(source, reversed)).toEqual(reversed)
    })
  })
})
