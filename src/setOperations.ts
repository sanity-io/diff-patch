/// <reference lib="esnext" />

export function difference<T>(source: Set<T>, target: Set<T>): Set<T> {
  if ('difference' in Set.prototype) {
    return source.difference(target)
  }

  const result = new Set<T>()
  for (const item of source) {
    if (!target.has(item)) {
      result.add(item)
    }
  }
  return result
}

export function intersection<T>(source: Set<T>, target: Set<T>): Set<T> {
  if ('intersection' in Set.prototype) {
    return source.intersection(target)
  }

  const result = new Set<T>()
  for (const item of source) {
    if (target.has(item)) {
      result.add(item)
    }
  }
  return result
}
