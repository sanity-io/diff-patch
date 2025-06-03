import {describe, test, expect} from 'vitest'
import {diffPatch} from '../src'
import * as fixture from './fixtures/portableText'

describe('portable text', () => {
  test('undo bold change', () => {
    expect(diffPatch(fixture.a, fixture.b)).toMatchSnapshot()
  })
})
