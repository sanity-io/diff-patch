import {describe, test, expect} from 'vitest'
import {diffPatch} from '../src'
import {applyAsTransaction, applySeparately} from './helpers/applyPatches'

function createRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Item = {_key: string; _type: string; text: string; n: number}

function generateCase(seed: number) {
  const random = createRandom(seed)
  const int = (max: number) => Math.floor(random() * max)
  let nextKey = 0
  const createItem = (): Item => ({
    _key: `k${nextKey++}`,
    _type: 'block',
    text: `text ${int(1000)}`,
    n: int(10),
  })

  const sourceItems = Array.from({length: int(12)}, createItem)
  const targetItems: Item[] = sourceItems
    .filter(() => random() > 0.2)
    .map((item) => {
      const roll = random()
      if (roll < 0.2) return {...item, text: `${item.text} edited`}
      if (roll < 0.3) return {...item, n: item.n + 1}
      return item
    })

  if (random() < 0.25) {
    for (let i = targetItems.length - 1; i > 0; i--) {
      const j = int(i + 1)
      ;[targetItems[i], targetItems[j]] = [targetItems[j], targetItems[i]]
    }
  } else {
    const shuffles = int(4)
    for (let i = 0; i < shuffles && targetItems.length > 1; i++) {
      const [moved] = targetItems.splice(int(targetItems.length), 1)
      targetItems.splice(int(targetItems.length + 1), 0, moved)
    }
  }

  const additions = int(4)
  for (let i = 0; i < additions; i++) {
    targetItems.splice(int(targetItems.length + 1), 0, createItem())
  }

  return {
    source: {_id: 'doc', _type: 'test', items: sourceItems},
    target: {_id: 'doc', _type: 'test', items: targetItems},
  }
}

describe('object array moves (generated)', () => {
  test('patches turn source into target for random keyed arrays', () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const {source, target} = generateCase(seed)
      const patches = diffPatch(source, target)
      expect(applySeparately(source, patches), `seed ${seed}, separately`).toEqual(target)
      expect(applyAsTransaction(source, patches), `seed ${seed}, transaction`).toEqual(target)
    }
  })

  test('only items outside the longest unchanged run are moved', () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const {source, target} = generateCase(seed)
      const targetKeys = new Set(target.items.map((item) => item._key))
      const removed = source.items.filter((item) => !targetKeys.has(item._key)).length
      const added = target.items.length - (source.items.length - removed)

      const sharedTargetPositions = source.items
        .map((item) => target.items.findIndex((other) => other._key === item._key))
        .filter((position) => position !== -1)
      const longestRun = sharedTargetPositions.reduce<number[]>((lengths, position, i) => {
        let best = 1
        for (let j = 0; j < i; j++) {
          if (sharedTargetPositions[j] < position) best = Math.max(best, lengths[j] + 1)
        }
        lengths.push(best)
        return lengths
      }, [])
      const moved = sharedTargetPositions.length - Math.max(0, ...longestRun)

      const patches = diffPatch(source, target)
      const unsetItems = patches.flatMap(({patch}) =>
        (patch.unset ?? []).filter((path) => /^items\[_key=="[^"]+"\]$/.test(path)),
      )
      const insertedItems = patches.flatMap(({patch}) => patch.insert?.items ?? [])
      expect(unsetItems.length, `seed ${seed}, unsets`).toBe(removed + moved)
      expect(insertedItems.length, `seed ${seed}, inserts`).toBe(added + moved)
    }
  })
})
