import {describe, test, expect} from 'vitest'
import {diffPatch} from '../src'
import * as dmp from './fixtures/dmp'

describe('diff match patch', () => {
  test('respects absolute length threshold', () => {
    expect(diffPatch(dmp.absoluteIn, dmp.absoluteOut)).toMatchSnapshot()
  })

  test('respects relative length threshold', () => {
    expect(diffPatch(dmp.relativeOverIn, dmp.relativeOverOut)).toMatchSnapshot()
  })

  test('respects relative length threshold (allowed)', () => {
    expect(diffPatch(dmp.relativeUnderIn, dmp.relativeUnderOut)).toMatchSnapshot()
  })

  test('does not use dmp for "privates" (underscore-prefixed keys)', () => {
    expect(diffPatch(dmp.privateChangeIn, dmp.privateChangeOut)).toMatchSnapshot()
  })

  test('does not use dmp for "type changes" (number => string)', () => {
    expect(diffPatch(dmp.typeChangeIn, dmp.typeChangeOut)).toMatchSnapshot()
  })

  test('handles patching with unicode surrogate pairs', () => {
    expect(
      diffPatch(dmp.unicodeChangeIn, dmp.unicodeChangeOut, {
        diffMatchPatch: {lengthThresholdAbsolute: 1, lengthThresholdRelative: 3},
      }),
    ).toMatchSnapshot()
  })
})
