/* eslint-disable complexity */
/* eslint-disable max-statements */
// NOTE: copied from the SDK for now (candidate to be moved to another package):
// https://github.com/sanity-io/sdk/blob/d88dc29b30562b791e3288d4d2a373919b7f6134/packages/core/src/document/patchOperations.ts
import {applyPatches, parsePatch} from '@sanity/diff-match-patch'
import {isKeyedObject, type KeyedSanityObject, type Path, type PathSegment} from '../../src/paths'
import {type SanityPatchOperations} from '../../src/patches'

type SanityInsertPatch = NonNullable<SanityPatchOperations['insert']>

type SingleValuePath = Exclude<
  PathSegment,
  // remove the index tuple
  [number | '', number | '']
>[]

type ToNumber<TInput extends string> = TInput extends `${infer TNumber extends number}`
  ? TNumber
  : TInput

/**
 * Parse a single "segment" that may include bracket parts.
 *
 * For example, the literal
 *
 * ```
 * "friends[0][1]"
 * ```
 *
 * is parsed as:
 *
 * ```
 * ["friends", 0, 1]
 * ```
 */
type ParseSegment<TInput extends string> = TInput extends `${infer TProp}[${infer TRest}`
  ? TProp extends ''
    ? [...ParseBracket<`[${TRest}`>] // no property name before '['
    : [TProp, ...ParseBracket<`[${TRest}`>]
  : TInput extends ''
    ? []
    : [TInput]

/**
 * Parse one or more bracketed parts from a segment.
 *
 * It recursively "peels off" a bracketed part and then continues.
 *
 * For example, given the string:
 *
 * ```
 * "[0][foo]"
 * ```
 *
 * it produces:
 *
 * ```
 * [ToNumber<"0">, "foo"]
 * ```
 */
type ParseBracket<TInput extends string> = TInput extends `[${infer TPart}]${infer TRest}`
  ? [ToNumber<TPart>, ...ParseSegment<TRest>]
  : [] // no leading bracket → end of this segment

/**
 * Split the entire path string on dots "outside" of any brackets.
 *
 * For example:
 * ```
 * "friends[0].name"
 * ```
 *
 * becomes:
 *
 * ```
 * [...ParseSegment<"friends[0]">, ...ParseSegment<"name">]
 * ```
 *
 * (We use a simple recursion that splits on the first dot.)
 */
type PathParts<TPath extends string> = TPath extends `${infer Head}.${infer Tail}`
  ? [Head, ...PathParts<Tail>]
  : TPath extends ''
    ? []
    : [TPath]

/**
 * Given a type T and an array of "access keys" Parts, recursively index into T.
 *
 * If a part is a key, it looks up that property.
 * If T is an array and the part is a number, it "indexes" into the element type.
 */
type DeepGet<TValue, TPath extends readonly (string | number)[]> = TPath extends []
  ? TValue
  : TPath extends readonly [infer THead, ...infer TTail]
    ? // Handle traversing into optional properties
      DeepGet<
        TValue extends undefined | null
          ? undefined // Stop traversal if current value is null/undefined
          : THead extends keyof TValue // Access property if key exists
            ? TValue[THead]
            : // Handle array indexing
              THead extends number
              ? TValue extends readonly (infer TElement)[]
                ? TElement | undefined // Array element or undefined if out of bounds
                : undefined // Cannot index non-array with number
              : undefined, // Key/index doesn't exist
        TTail extends readonly (string | number)[] ? TTail : [] // Continue with the rest of the path
      >
    : never // Should be unreachable

/**
 * Given a document type TDocument and a JSON Match path string TPath,
 * compute the type found at that path.
 * @beta
 */
export type JsonMatch<TDocument, TPath extends string> = DeepGet<TDocument, PathParts<TPath>>

function parseBracketContent(content: string): PathSegment {
  // 1) Range match:  ^(\d*):(\d*)$
  //    - start or end can be empty (meaning "start" or "end" of array)
  const rangeMatch = content.match(/^(\d*):(\d*)$/)
  if (rangeMatch) {
    const startStr = rangeMatch[1]
    const endStr = rangeMatch[2]
    const start: number | '' = startStr === '' ? '' : parseInt(startStr, 10)
    const end: number | '' = endStr === '' ? '' : parseInt(endStr, 10)
    return [start, end]
  }

  // 2) Keyed segment match:  ^_key==["'](.*)["']$
  //    (We allow either double or single quotes for the value)
  const keyedMatch = content.match(/^_key==["'](.+)["']$/)
  if (keyedMatch) {
    return {_key: keyedMatch[1]}
  }

  // 3) Single index (positive or negative)
  const index = parseInt(content, 10)
  if (!isNaN(index)) {
    return index
  }

  // 4) Escaped string key
  if (content.startsWith("'") && content.endsWith("'")) {
    return content.slice(1, -1)
  }

  throw new Error(`Invalid bracket content: "[${content}]"`)
}

function parseSegment(segment: string): PathSegment[] {
  // Each "segment" can contain:
  // - A leading property name (optional).
  // - Followed by zero or more bracket expressions, e.g. foo[1][_key=="bar"][2:9].
  //
  // We'll collect these into an array of path segments.

  const segments: PathSegment[] = []
  let idx = 0

  // Helper to push a string if it's not empty
  function pushIfNotEmpty(text: string) {
    if (text) {
      segments.push(text)
    }
  }

  while (idx < segment.length) {
    // Look for the next '['
    const openIndex = segment.indexOf('[', idx)
    if (openIndex === -1) {
      // No more brackets – whatever remains is a plain string key
      const remaining = segment.slice(idx)
      pushIfNotEmpty(remaining)
      break
    }

    // Push text before this bracket (as a string key) if not empty
    const before = segment.slice(idx, openIndex)
    pushIfNotEmpty(before)

    // Find the closing bracket
    const closeIndex = segment.indexOf(']', openIndex)
    if (closeIndex === -1) {
      throw new Error(`Unmatched "[" in segment: "${segment}"`)
    }

    // Extract the bracket content
    const bracketContent = segment.slice(openIndex + 1, closeIndex)
    segments.push(parseBracketContent(bracketContent))

    // Move past the bracket
    idx = closeIndex + 1
  }

  return segments
}

export function parsePath(path: string): Path {
  // We want to split on '.' outside of brackets. A simple approach is
  // to track "are we in bracket or not?" while scanning.
  const result: Path = []
  let buffer = ''
  let bracketDepth = 0

  for (let i = 0; i < path.length; i++) {
    const ch = path[i]
    if (ch === '[') {
      bracketDepth++
      buffer += ch
    } else if (ch === ']') {
      bracketDepth--
      buffer += ch
    } else if (ch === '.' && bracketDepth === 0) {
      // We hit a dot at the top level → this ends one segment
      if (buffer) {
        result.push(...parseSegment(buffer))
        buffer = ''
      }
    } else {
      buffer += ch
    }
  }

  // If there's anything left in the buffer, parse it
  if (buffer) {
    result.push(...parseSegment(buffer))
  }

  return result
}

export function stringifyPath(path: Path): string {
  let result = ''
  for (let i = 0; i < path.length; i++) {
    const segment = path[i]

    if (typeof segment === 'string') {
      // If not the first segment and the previous segment was
      // not a bracket form, we add a dot
      if (result) {
        result += '.'
      }
      result += segment
    } else if (typeof segment === 'number') {
      // Single index
      result += `[${segment}]`
    } else if (Array.isArray(segment)) {
      // Index tuple
      const [start, end] = segment
      const startStr = start === '' ? '' : String(start)
      const endStr = end === '' ? '' : String(end)
      result += `[${startStr}:${endStr}]`
    } else {
      // Keyed segment
      // e.g. {_key: "someValue"} => [_key=="someValue"]
      result += `[_key=="${segment._key}"]`
    }
  }
  return result
}

type MatchEntry<T = unknown> = {
  value: T
  path: SingleValuePath
}

/**
 * A very simplified implementation of [JSONMatch][0] that only supports:
 * - descent e.g. `friend.name`
 * - array index e.g. `items[-1]`
 * - array matching with `_key` e.g. `items[_key=="dd9efe09"]`
 * - array matching with a range e.g. `items[4:]`
 *
 * E.g. `friends[_key=="dd9efe09"].address.zip`
 *
 * [0]: https://www.sanity.io/docs/json-match
 *
 * @beta
 */
export function jsonMatch<TDocument, TPath extends string>(
  input: TDocument,
  path: TPath,
): MatchEntry<JsonMatch<TDocument, TPath>>[]
/** @beta */
export function jsonMatch<TValue>(input: unknown, path: string): MatchEntry<TValue>[]
/** @beta */
export function jsonMatch(input: unknown, pathExpression: string): MatchEntry[] {
  return matchRecursive(input, parsePath(pathExpression), [])
}

function matchRecursive(value: unknown, path: Path, currentPath: SingleValuePath): MatchEntry[] {
  // If we've consumed the entire path, return the final match
  if (path.length === 0) {
    return [{value, path: currentPath}]
  }

  const [head, ...rest] = path

  // 1) String segment => object property
  if (typeof head === 'string') {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>
      const nextValue = obj[head]
      return matchRecursive(nextValue, rest, [...currentPath, head])
    }
    // If not an object with that property, no match
    return []
  }

  // 2) Numeric segment => array index
  if (typeof head === 'number') {
    if (Array.isArray(value)) {
      const nextValue = value.at(head)
      return matchRecursive(nextValue, rest, [...currentPath, head])
    }
    // If not an array, no match
    return []
  }

  // 3) Index tuple => multiple indices
  if (Array.isArray(head)) {
    // This is a range: [start, end]
    if (!Array.isArray(value)) {
      // If not an array, no match
      return []
    }

    const [start, end] = head
    // Convert empty strings '' to the start/end of the array
    const startIndex = start === '' ? 0 : start
    const endIndex = end === '' ? value.length : end

    // We'll accumulate all matches from each index in the range
    return value
      .slice(startIndex, endIndex)
      .flatMap((item, i) => matchRecursive(item, rest, [...currentPath, i + startIndex]))
  }

  // 4) Keyed segment => find index in array
  //    e.g. {_key: 'foo'}
  const keyed = head as KeyedSanityObject
  const arrIndex = getIndexForKey(value, keyed._key)
  if (arrIndex === undefined || !Array.isArray(value)) {
    return []
  }

  const nextVal = value[arrIndex]
  return matchRecursive(nextVal, rest, [...currentPath, {_key: keyed._key}])
}

/**
 * Given an input object and a record of path expressions to values, this
 * function will set each match with the given value.
 *
 * ```js
 * const output = set(
 *   {name: {first: 'initial', last: 'initial'}},
 *   {'name.first': 'changed'}
 * );
 *
 * // { name: { first: 'changed', last: 'initial' } }
 * console.log(output);
 * ```
 */
export function set<R>(input: unknown, pathExpressionValues: Record<string, unknown>): R
export function set(input: unknown, pathExpressionValues: Record<string, unknown>): unknown {
  const result = Object.entries(pathExpressionValues)
    .flatMap(([pathExpression, replacementValue]) =>
      jsonMatch(input, pathExpression).map((matchEntry) => ({
        ...matchEntry,
        replacementValue,
      })),
    )
    .reduce((acc, {path, replacementValue}) => setDeep(acc, path, replacementValue), input)

  return result
}

/**
 * Given an input object and an array of path expressions, this function will
 * remove each match from the input object.
 *
 * ```js
 * const output = unset(
 *   {name: {first: 'one', last: 'two'}},
 *   ['name.last']
 * );
 *
 * // { name: { first: 'one' } }
 * console.log(output);
 * ```
 */
export function unset<R>(input: unknown, pathExpressions: string[]): R
export function unset(input: unknown, pathExpressions: string[]): unknown {
  const result = pathExpressions
    .flatMap((pathExpression) => jsonMatch(input, pathExpression))
    .reverse()
    .reduce((acc, {path}) => unsetDeep(acc, path), input)

  return result
}

/**
 * Given an input object, a path expression (inside the insert patch object), and an array of items,
 * this function will insert or replace the matched items.
 *
 * **Insert before:**
 *
 * ```js
 * const input = {some: {array: ['a', 'b', 'c']}}
 * const output = insert(
 *   input,
 *   {
 *     before: 'some.array[1]',
 *     items: ['!']
 *   }
 * );
 * // { some: { array: ['a', '!', 'b', 'c'] } }
 * console.log(output);
 * ```
 *
 * **Insert before with negative index (append):**
 *
 * ```js
 * const input = {some: {array: ['a', 'b', 'c']}}
 * const output = insert(
 *   input,
 *   {
 *     before: 'some.array[-1]',
 *     items: ['!']
 *   }
 * );
 * // { some: { array: ['a', 'b', 'c', '!'] } }
 * console.log(output);
 * ```
 *
 * **Insert after:**
 *
 * ```js
 * const input = {some: {array: ['a', 'b', 'c']}}
 * const output = insert(
 *   input,
 *   {
 *     after: 'some.array[1]',
 *     items: ['!']
 *   }
 * );
 * // { some: { array: ['a', 'b', '!', 'c'] } }
 * console.log(output);
 * ```
 *
 * **Replace:**
 *
 * ```js
 * const output = insert(
 *   { some: { array: ['a', 'b', 'c'] } },
 *   {
 *     replace: 'some.array[1]',
 *     items: ['!']
 *   }
 * );
 * // { some: { array: ['a', '!', 'c'] } }
 * console.log(output);
 * ```
 *
 * **Replace many:**
 *
 * ```js
 * const input = {some: {array: ['a', 'b', 'c', 'd']}}
 * const output = insert(
 *   input,
 *   {
 *     replace: 'some.array[1:3]',
 *     items: ['!', '?']
 *   }
 * );
 * // { some: { array: ['a', '!', '?', 'd'] } }
 * console.log(output);
 * ```
 */
export function insert<R>(input: unknown, insertPatch: SanityInsertPatch): R
export function insert(input: unknown, {items, ...insertPatch}: SanityInsertPatch): unknown {
  let operation
  let pathExpression

  // behavior observed from content-lake when inserting:
  // 1. if the operation is before, out of all the matches, it will use the
  //    insert the items before the first match that appears in the array
  // 2. if the operation is after, it will insert the items after the first
  //    match that appears in the array
  // 3. if the operation is replace, then insert the items before the first
  //    match and then delete the rest
  if ('before' in insertPatch) {
    operation = 'before' as const
    pathExpression = insertPatch.before
  } else if ('after' in insertPatch) {
    operation = 'after' as const
    pathExpression = insertPatch.after
  } else if ('replace' in insertPatch) {
    operation = 'replace' as const
    pathExpression = insertPatch.replace
  }
  if (!operation) return input
  if (typeof pathExpression !== 'string') return input

  const parsedPath = parsePath(pathExpression)
  // in order to do an insert patch, you need to provide at least one path segment
  if (!parsedPath.length) return input

  const arrayPath = stringifyPath(parsedPath.slice(0, -1))
  const positionPath = stringifyPath(parsedPath.slice(-1))

  const arrayMatches = jsonMatch<unknown[]>(input, arrayPath)

  let result = input

  for (const {path, value} of arrayMatches) {
    if (!Array.isArray(value)) continue
    let arr = value

    switch (operation) {
      case 'replace': {
        const indexesToRemove = new Set<number>()
        let position = Infinity

        for (const itemMatch of jsonMatch(arr, positionPath)) {
          // there should only be one path segment for an insert patch, invalid otherwise
          if (itemMatch.path.length !== 1) continue
          const [segment] = itemMatch.path
          if (typeof segment === 'string') continue

          let index: number | undefined

          if (typeof segment === 'number') index = segment
          if (typeof index === 'number' && index < 0) index = arr.length + index
          if (isKeyedObject(segment)) index = getIndexForKey(arr, segment._key)
          if (typeof index !== 'number') continue
          if (index < 0) index = arr.length + index

          indexesToRemove.add(index)
          if (index < position) position = index
        }

        if (position === Infinity) continue

        // remove all other indexes
        arr = arr
          .map((item, index) => ({item, index}))
          .filter(({index}) => !indexesToRemove.has(index))
          .map(({item}) => item)

        // insert at the min index
        arr = [...arr.slice(0, position), ...items, ...arr.slice(position, arr.length)]

        break
      }
      case 'before': {
        let position = Infinity

        for (const itemMatch of jsonMatch(arr, positionPath)) {
          if (itemMatch.path.length !== 1) continue
          const [segment] = itemMatch.path

          if (typeof segment === 'string') continue

          let index: number | undefined

          if (typeof segment === 'number') index = segment
          if (typeof index === 'number' && index < 0) index = arr.length + index
          if (isKeyedObject(segment)) index = getIndexForKey(arr, segment._key)
          if (typeof index !== 'number') continue
          if (index < 0) index = arr.length - index
          if (index < position) position = index
        }

        if (position === Infinity) continue

        arr = [...arr.slice(0, position), ...items, ...arr.slice(position, arr.length)]

        break
      }
      case 'after': {
        let position = -Infinity

        for (const itemMatch of jsonMatch(arr, positionPath)) {
          if (itemMatch.path.length !== 1) continue
          const [segment] = itemMatch.path

          if (typeof segment === 'string') continue

          let index: number | undefined

          if (typeof segment === 'number') index = segment
          if (typeof index === 'number' && index < 0) index = arr.length + index
          if (isKeyedObject(segment)) index = getIndexForKey(arr, segment._key)
          if (typeof index !== 'number') continue
          if (index > position) position = index
        }

        if (position === -Infinity) continue

        arr = [...arr.slice(0, position + 1), ...items, ...arr.slice(position + 1, arr.length)]

        break
      }

      default: {
        continue
      }
    }

    result = setDeep(result, path, arr)
  }

  return result
}

/**
 * Given an input object and a record of paths to [diff match patches][0], this
 * function will apply the diff match patch for the string at each match.
 *
 * [0]: https://www.sanity.io/docs/http-patches#aTbJhlAJ
 *
 * ```js
 * const output = diffMatchPatch(
 *   {foo: 'the quick brown fox'},
 *   {'foo': '@@ -13,7 +13,7 @@\n own \n-fox\n+cat\n'}
 * );
 *
 * // { foo: 'the quick brown cat' }
 * console.log(output);
 * ```
 */
export function diffMatchPatch<R>(input: unknown, pathExpressionValues: Record<string, string>): R
export function diffMatchPatch(
  input: unknown,
  pathExpressionValues: Record<string, string>,
): unknown {
  const result = Object.entries(pathExpressionValues)
    .flatMap(([pathExpression, dmp]) => jsonMatch(input, pathExpression).map((m) => ({...m, dmp})))
    .filter((i) => i.value !== undefined)
    .map(({path, value, dmp}) => {
      if (typeof value !== 'string') {
        throw new Error(
          `Can't diff-match-patch \`${JSON.stringify(value)}\` at path \`${stringifyPath(path)}\`, because it is not a string`,
        )
      }

      const [nextValue] = applyPatches(parsePatch(dmp), value)
      return {path, value: nextValue}
    })
    .reduce((acc, {path, value}) => setDeep(acc, path, value), input)

  return result
}

/**
 * Simply checks if the given document input has a `_rev` that matches the given
 * `revisionId` and throws otherwise.
 *
 * (No code example provided.)
 */
export function ifRevisionID<R>(input: unknown, revisionId: string): R
export function ifRevisionID(input: unknown, revisionId: string): unknown {
  const inputRev =
    typeof input === 'object' && !!input && '_rev' in input && typeof input._rev === 'string'
      ? input._rev
      : undefined

  if (typeof inputRev !== 'string') {
    throw new Error(`Patch specified \`ifRevisionID\` but could not find document's revision ID.`)
  }

  if (revisionId !== inputRev) {
    throw new Error(
      `Patch's \`ifRevisionID\` \`${revisionId}\` does not match document's revision ID \`${inputRev}\``,
    )
  }

  return input
}

const indexCache = new WeakMap<KeyedSanityObject[], Record<string, number | undefined>>()
export function getIndexForKey(input: unknown, key: string): number | undefined {
  if (!Array.isArray(input)) return undefined
  const cached = indexCache.get(input)
  if (cached) return cached[key]

  const lookup = input.reduce<Record<string, number | undefined>>((acc, next, index) => {
    if (typeof next?._key === 'string') acc[next._key] = index
    return acc
  }, {})

  indexCache.set(input, lookup)
  return lookup[key]
}

/**
 * Gets a value deep inside of an object given a path. If the path does not
 * exist in the object, `undefined` will be returned.
 */
export function getDeep<R>(input: unknown, path: SingleValuePath): R
export function getDeep(input: unknown, path: SingleValuePath): unknown {
  const [currentSegment, ...restOfPath] = path
  if (currentSegment === undefined) return input
  if (typeof input !== 'object' || input === null) return undefined

  let key: string | number | undefined
  if (isKeyedObject(currentSegment)) {
    key = getIndexForKey(input, currentSegment._key)
  } else if (typeof currentSegment === 'string') {
    key = currentSegment
  } else if (typeof currentSegment === 'number') {
    key = currentSegment
  }

  if (key === undefined) return undefined

  // Use .at() to support negative indexes on arrays.
  const nestedInput =
    typeof key === 'number' && Array.isArray(input)
      ? input.at(key)
      : (input as Record<string, unknown>)[key]

  return getDeep(nestedInput, restOfPath)
}

/**
 * Sets a value deep inside of an object given a path. If the path does not
 * exist in the object, it will be created.
 */
export function setDeep<R>(input: unknown, path: SingleValuePath, value: unknown): R
export function setDeep(input: unknown, path: SingleValuePath, value: unknown): unknown {
  const [currentSegment, ...restOfPath] = path
  if (currentSegment === undefined) return value

  // If the current input is not an object, create a new container.
  if (typeof input !== 'object' || input === null) {
    if (typeof currentSegment === 'string') {
      return {[currentSegment]: setDeep(null, restOfPath, value)}
    }

    let index: number | undefined
    if (isKeyedObject(currentSegment)) {
      // When creating a new array via a keyed segment, use index 0.
      index = 0
    } else if (typeof currentSegment === 'number' && currentSegment >= 0) {
      index = currentSegment
    } else {
      // For negative numbers in a non‐object we simply return input.
      return input
    }

    return [
      // fill until index
      ...Array.from({length: index}).fill(null),
      // then set deep here
      setDeep(null, restOfPath, value),
    ]
  }

  // When input is an array…
  if (Array.isArray(input)) {
    let index: number | undefined
    if (isKeyedObject(currentSegment)) {
      index = getIndexForKey(input, currentSegment._key)
    } else if (typeof currentSegment === 'number') {
      // Support negative indexes by computing the proper positive index.
      index = currentSegment < 0 ? input.length + currentSegment : currentSegment
    }
    if (index === undefined) return input

    if (index in input) {
      // Update the element at the resolved index.
      return input.map((nestedInput, i) =>
        i === index ? setDeep(nestedInput, restOfPath, value) : nestedInput,
      )
    }

    // Expand the array if needed.
    return [
      ...input,
      ...Array.from({length: index - input.length}).fill(null),
      setDeep(null, restOfPath, value),
    ]
  }

  // For keyed segments that aren't arrays, do nothing.
  if (typeof currentSegment === 'object') return input

  // For plain objects, update an existing property if it exists…
  if (currentSegment in input) {
    return Object.fromEntries(
      Object.entries(input).map(([key, nestedInput]) =>
        key === currentSegment
          ? [key, setDeep(nestedInput, restOfPath, value)]
          : [key, nestedInput],
      ),
    )
  }

  // ...otherwise create the new nested path.
  return {...input, [currentSegment]: setDeep(null, restOfPath, value)}
}

/**
 * Given an object and an exact path as an array, this unsets the value at the
 * given path.
 */
export function unsetDeep<R>(input: unknown, path: SingleValuePath): R
export function unsetDeep(input: unknown, path: SingleValuePath): unknown {
  const [currentSegment, ...restOfPath] = path
  if (currentSegment === undefined) return input
  if (typeof input !== 'object' || input === null) return input

  let _segment: string | number | undefined
  if (isKeyedObject(currentSegment)) {
    _segment = getIndexForKey(input, currentSegment._key)
  } else if (typeof currentSegment === 'string' || typeof currentSegment === 'number') {
    _segment = currentSegment
  }
  if (_segment === undefined) return input

  // For numeric segments in arrays, compute the positive index.
  let segment: string | number = _segment
  if (typeof segment === 'number' && Array.isArray(input)) {
    segment = segment < 0 ? input.length + segment : segment
  }
  if (!(segment in input)) return input

  // If we're at the final segment, remove the property/element.
  if (!restOfPath.length) {
    if (Array.isArray(input)) {
      return input.filter((_nestedInput, index) => index !== segment)
    }
    return Object.fromEntries(Object.entries(input).filter(([key]) => key !== segment.toString()))
  }

  // Otherwise, recurse into the nested value.
  if (Array.isArray(input)) {
    return input.map((nestedInput, index) =>
      index === segment ? unsetDeep(nestedInput, restOfPath) : nestedInput,
    )
  }

  return Object.fromEntries(
    Object.entries(input).map(([key, value]) =>
      key === segment ? [key, unsetDeep(value, restOfPath)] : [key, value],
    ),
  )
}
