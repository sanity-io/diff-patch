import {describe, test, expect} from 'vitest'
import {validateDocument} from '../src/validate'

describe('validate', () => {
  test('validate does not throw on legal documents', () => {
    const doc = {
      _id: 'abc123',
      arr: [1, 2, 3],
      obj: {nested: 'values'},
      bool: true,
      number: 1337,
    }

    expect(() => validateDocument(doc)).not.toThrow()
    expect(validateDocument(doc)).toBe(true)
  })

  test('validate throws on multidimensional arrays', () => {
    expect(() => {
      validateDocument({_id: 'abc123', arr: [['foo', 'bar']]})
    }).toThrowErrorMatchingInlineSnapshot(
      `[Error: Multi-dimensional arrays not supported (at 'arr[0]')]`,
    )
  })

  test('invalid keys', () => {
    expect(() => {
      validateDocument({_id: 'agot', _type: 'book', author: {_key: '$', name: 'GRRM'}})
    }).toThrowErrorMatchingInlineSnapshot(
      `[Error: Invalid key - use less exotic characters (at 'author._key')]`,
    )

    expect(() => {
      validateDocument({_id: 'agot', _type: 'book', author: {_ref: '$foo'}})
    }).toThrowErrorMatchingInlineSnapshot(
      `[Error: Invalid key - use less exotic characters (at 'author._ref')]`,
    )

    expect(() => {
      validateDocument({_id: 'agot', _type: 'book', author: {_type: 'some%value'}})
    }).toThrowErrorMatchingInlineSnapshot(
      `[Error: Invalid key - use less exotic characters (at 'author._type')]`,
    )
  })
})
