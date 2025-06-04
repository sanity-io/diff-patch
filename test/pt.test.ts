import {describe, test, expect} from 'vitest'
import {diffPatch} from '../src'
import * as fixture from './fixtures/portableText'
import {applyPatches} from './helpers/applyPatches'

describe('portable text', () => {
  test('undo bold change', () => {
    const patches = diffPatch(fixture.a, fixture.b)
    expect(patches).toMatchSnapshot()
    expect(applyPatches(fixture.a, patches)).toEqual(fixture.b)
  })
})
