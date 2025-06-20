import {describe, test, expect} from 'vitest'
import {diffPatch} from '../src'
import * as dataTypes from './fixtures/data-types'
import * as typeChange from './fixtures/type-change'

describe('diff data types', () => {
  test('same data type', () => {
    expect(diffPatch(dataTypes.a, dataTypes.b)).toEqual([
      {
        patch: {
          id: dataTypes.a._id,

          diffMatchPatch: {title: '@@ -6,5 +6,20 @@\n ard \n-3\n+with a Vengeance\n'},
        },
      },
      {
        patch: {
          id: dataTypes.a._id,
          set: {isFeatured: false, rating: 4.24},
        },
      },
      {
        patch: {
          id: dataTypes.a._id,
          diffMatchPatch: {
            'characters[0]': '@@ -1,12 +1,12 @@\n-John McClane\n+Simon Gruber\n',
            'slug.current': '@@ -6,7 +6,20 @@\n ard-\n-iii\n+with-a-vengeance\n',
          },
        },
      },
      {
        patch: {
          id: dataTypes.a._id,
          set: {year: 1995},
        },
      },
    ])
  })

  test('different data type', () => {
    expect(diffPatch(dataTypes.a, dataTypes.c)).toEqual([
      {
        patch: {
          id: dataTypes.a._id,
          set: {
            characters: {simon: 'Simon Gruber'},
            isFeatured: 'yup',
            rating: {current: 4.24},
            slug: 'die-hard-with-a-vengeance',
            title: ['Die Hard with a Vengeance'],
            year: {released: 1995},
          },
        },
      },
    ])
  })

  test('different data type (object => array)', () => {
    expect(diffPatch(dataTypes.a, dataTypes.d)).toEqual([
      {
        patch: {
          id: dataTypes.a._id,
          set: {slug: ['die-hard-with-a-vengeance']},
        },
      },
    ])
  })

  test('type changes', () => {
    expect(diffPatch(typeChange.a, typeChange.b)).toEqual([
      {patch: {id: 'abc123', unset: ['unset']}},
      {patch: {id: 'abc123', set: {number: 1337}}},
      {patch: {diffMatchPatch: {string: '@@ -1,3 +1,3 @@\n-foo\n+bar\n'}, id: 'abc123'}},
      {patch: {id: 'abc123', set: {'array[0]': 0, 'array[1]': 'one', bool: false}}},
      {patch: {id: 'abc123', unset: ['array[2].two.levels.deep']}},
      {
        patch: {
          id: 'abc123',
          set: {'array[2].two.levels.other': 'value', 'object.b12': '12', 'object.f13': null},
        },
      },
    ])
  })
})
