import {describe, test, expect} from 'vitest'
import {diffPatch} from '../src'

describe('safeguards', () => {
  test('throws when attempting to change `_type` at root', () => {
    expect(() => {
      diffPatch({_id: 'foo', _type: 'bar'}, {_id: 'foo', _type: 'bar2'})
    }).toThrowErrorMatchingInlineSnapshot(
      `[Error: _type is immutable and cannot be changed (bar => bar2)]`,
    )
  })

  test('changing non-root `_type` is allowed', () => {
    expect(
      diffPatch(
        {_type: 'author', name: 'Espen'},
        {_type: 'person', name: 'Espen'},
        {basePath: ['author'], id: 'foo'},
      ),
    ).toEqual([
      {
        patch: {
          id: 'foo',
          set: {
            'author._type': 'person',
          },
        },
      },
    ])
  })

  test('cannot contain multidimensional arrays', () => {
    expect(() => {
      diffPatch(
        {_id: 'agot', _type: 'book', title: 'A Game of Thrones', categories: []},
        {_id: 'agot', _type: 'book', title: 'A Game of Thrones', categories: [['foo']]},
      )
    }).toThrowErrorMatchingInlineSnapshot(
      `[Error: Multi-dimensional arrays not supported (at 'categories[0]')]`,
    )
  })

  test('cannot contain numeric object keys', () => {
    expect(() => {
      diffPatch(
        {_id: 'agot', _type: 'book', '13': 'value'},
        {_id: 'agot', _type: 'book', '13': 'changed'},
      )
    }).toThrowErrorMatchingInlineSnapshot(
      `[Error: Keys must start with a letter (a-z) (at '['13']')]`,
    )

    expect(() => {
      diffPatch(
        {_id: 'agot', _type: 'book', nested: {'13': 'value'}},
        {_id: 'agot', _type: 'book', nested: {'13': 'changed'}},
      )
    }).toThrowErrorMatchingInlineSnapshot(
      `[Error: Keys must start with a letter (a-z) (at 'nested['13']')]`,
    )
  })

  test('object keys cannot contain non-a-z characters', () => {
    expect(() => {
      diffPatch({_id: 'agot', _type: 'book', 'feeling💩today': true}, {_id: 'agot', _type: 'book'})
    }).toThrowErrorMatchingInlineSnapshot(
      `[Error: Keys can only contain letters, numbers and underscores (at '['feeling💩today']')]`,
    )

    expect(() => {
      diffPatch({_id: 'agot', _type: 'book'}, {_id: 'agot', _type: 'book', 'feeling💩today': true})
    }).toThrowErrorMatchingInlineSnapshot(
      `[Error: Keys can only contain letters, numbers and underscores (at '['feeling💩today']')]`,
    )

    expect(() => {
      diffPatch({_id: 'agot', _type: 'book', "it's a good day": true}, {_id: 'agot', _type: 'book'})
    }).toThrowErrorMatchingInlineSnapshot(
      `[Error: Keys can only contain letters, numbers and underscores (at '['it's a good day']')]`,
    )

    expect(() => {
      diffPatch({_id: 'agot', _type: 'book'}, {_id: 'agot', _type: 'book', "it's a good day": true})
    }).toThrowErrorMatchingInlineSnapshot(
      `[Error: Keys can only contain letters, numbers and underscores (at '['it's a good day']')]`,
    )
  })

  test('object keys cannot be/contain whitespace', () => {
    expect(() => {
      diffPatch({_id: 'agot', _type: 'book', 'foo bar': true}, {_id: 'agot', _type: 'book'})
    }).toThrowErrorMatchingInlineSnapshot(
      `[Error: Keys can only contain letters, numbers and underscores (at '['foo bar']')]`,
    )

    expect(() => {
      diffPatch({_id: 'agot', _type: 'book'}, {_id: 'agot', _type: 'book', 'foo bar': true})
    }).toThrowErrorMatchingInlineSnapshot(
      `[Error: Keys can only contain letters, numbers and underscores (at '['foo bar']')]`,
    )

    expect(() => {
      diffPatch({_id: 'agot', _type: 'book', ' ': true}, {_id: 'agot', _type: 'book'})
    }).toThrowErrorMatchingInlineSnapshot(
      `[Error: Keys must start with a letter (a-z) (at '[' ']')]`,
    )

    expect(() => {
      diffPatch({_id: 'agot', _type: 'book'}, {_id: 'agot', _type: 'book', ' ': true})
    }).toThrowErrorMatchingInlineSnapshot(
      `[Error: Keys must start with a letter (a-z) (at '[' ']')]`,
    )

    expect(() => {
      diffPatch({_id: 'agot', _type: 'book', '': true}, {_id: 'agot', _type: 'book'})
    }).toThrowErrorMatchingInlineSnapshot(
      `[Error: Keys must start with a letter (a-z) (at '['']')]`,
    )

    expect(() => {
      diffPatch({_id: 'agot', _type: 'book'}, {_id: 'agot', _type: 'book', '': true})
    }).toThrowErrorMatchingInlineSnapshot(
      `[Error: Keys must start with a letter (a-z) (at '['']')]`,
    )
  })

  test('object `_key` must be strings', () => {
    expect(() => {
      diffPatch(
        {_id: 'agot', _type: 'book', author: {_key: 13, name: 'GRRM'}},
        {_id: 'agot', _type: 'book', author: {_key: 'abc', name: 'GRRM'}},
      )
    }).toThrowErrorMatchingInlineSnapshot(`[Error: Keys must be strings (at 'author._key')]`)

    expect(() => {
      diffPatch(
        {_id: 'agot', _type: 'book', author: {_key: 'abc', name: 'GRRM'}},
        {_id: 'agot', _type: 'book', author: {_key: 13, name: 'GRRM'}},
      )
    }).toThrowErrorMatchingInlineSnapshot(`[Error: Keys must be strings (at 'author._key')]`)
  })

  test('object `_key` must be identifiers', () => {
    expect(() => {
      diffPatch(
        {_id: 'agot', _type: 'book', author: {_key: '$', name: 'GRRM'}},
        {_id: 'agot', _type: 'book', author: {_key: 'foo', name: 'GRRM'}},
      )
    }).toThrowErrorMatchingInlineSnapshot(
      `[Error: Invalid key - use less exotic characters (at 'author._key')]`,
    )

    expect(() => {
      diffPatch(
        {_id: 'agot', _type: 'book', author: {_key: 'foo', name: 'GRRM'}},
        {_id: 'agot', _type: 'book', author: {_key: '$', name: 'GRRM'}},
      )
    }).toThrowErrorMatchingInlineSnapshot(
      `[Error: Invalid key - use less exotic characters (at 'author._key')]`,
    )
  })
})
