import {describe, test, expect} from 'vitest'
import {diffPatch} from '../src'
import * as dmp from './fixtures/dmp'
import {applyPatches} from './helpers/applyPatches'

describe('diff match patch', () => {
  test('respects absolute length threshold', () => {
    const patches = diffPatch(dmp.absoluteIn, dmp.absoluteOut)
    expect(patches).toMatchSnapshot()
    expect(applyPatches(dmp.absoluteIn, patches)).toEqual(dmp.absoluteOut)
  })

  test('respects relative length threshold', () => {
    const patches = diffPatch(dmp.relativeOverIn, dmp.relativeOverOut)
    expect(patches).toMatchSnapshot()
    expect(applyPatches(dmp.relativeOverIn, patches)).toEqual(dmp.relativeOverOut)
  })

  test('respects relative length threshold (allowed)', () => {
    const patches = diffPatch(dmp.relativeUnderIn, dmp.relativeUnderOut)
    expect(patches).toMatchSnapshot()
    expect(applyPatches(dmp.relativeUnderIn, patches)).toEqual(dmp.relativeUnderOut)
  })

  test('does not use dmp for "privates" (underscore-prefixed keys)', () => {
    const patches = diffPatch(dmp.privateChangeIn, dmp.privateChangeOut)
    expect(patches).toMatchSnapshot()
    expect(applyPatches(dmp.privateChangeIn, patches)).toEqual(dmp.privateChangeOut)
  })

  test('does not use dmp for "type changes" (number => string)', () => {
    const patches = diffPatch(dmp.typeChangeIn, dmp.typeChangeOut)
    expect(patches).toMatchSnapshot()
    expect(applyPatches(dmp.typeChangeIn, patches)).toEqual(dmp.typeChangeOut)
  })

  test('handles patching with unicode surrogate pairs', () => {
    const patches = diffPatch(dmp.unicodeChangeIn, dmp.unicodeChangeOut)
    expect(patches).toMatchSnapshot()
    expect(applyPatches(dmp.unicodeChangeIn, patches)).toEqual(dmp.unicodeChangeOut)
  })
})
