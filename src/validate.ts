import {DiffError} from './diffError.js'
import type {Path} from './paths.js'

const idPattern = /^[a-z0-9][a-z0-9_.-]+$/i
const propPattern = /^[a-zA-Z_][a-zA-Z0-9_-]*$/
const propStartPattern = /^[a-z_]/i

/**
 * Validate the given document/subtree for Sanity compatibility
 *
 * @param item - The document or subtree to validate
 * @param path - The path to the current item, for error reporting
 * @returns True if valid, throws otherwise
 * @internal
 */
export function validateDocument(item: unknown, path: Path = []): boolean {
  if (Array.isArray(item)) {
    return item.every((child, i) => {
      if (Array.isArray(child)) {
        throw new DiffError('Multi-dimensional arrays not supported', path.concat(i))
      }

      return validateDocument(child, path.concat(i))
    })
  }

  if (typeof item === 'object' && item !== null) {
    const obj = item as {[key: string]: any}
    return Object.keys(obj).every(
      (key) =>
        validateProperty(key, obj[key], path) && validateDocument(obj[key], path.concat(key)),
    )
  }

  return true
}

/**
 * Validate a property for Sanity compatibility
 *
 * @param property - The property to valide
 * @param value - The value of the property
 * @param path - The path of the property, for error reporting
 * @returns The property name, if valid
 * @internal
 */
export function validateProperty(property: string, value: unknown, path: Path): string {
  if (!propStartPattern.test(property)) {
    throw new DiffError('Keys must start with a letter (a-z)', path.concat(property), value)
  }

  if (!propPattern.test(property)) {
    throw new DiffError(
      'Keys can only contain letters, numbers and underscores',
      path.concat(property),
      value,
    )
  }

  if (property === '_key' || property === '_ref' || property === '_type') {
    if (typeof value !== 'string') {
      throw new DiffError('Keys must be strings', path.concat(property), value)
    }

    if (!idPattern.test(value)) {
      throw new DiffError('Invalid key - use less exotic characters', path.concat(property), value)
    }
  }

  return property
}
