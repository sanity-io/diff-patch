/* eslint-disable no-sync, max-nested-callbacks */
import fs from 'fs'
import path from 'path'
import PQueue from 'p-queue'
import {createClient} from '@sanity/client'
import {describe, test, expect} from 'vitest'
import {applyPatches} from './helpers/applyPatches'

import {diffPatch} from '../src'

function omitIgnored(obj: {[key: string]: any}): {[key: string]: any} {
  const {_type, _createdAt, _updatedAt, _rev, ...rest} = obj
  return rest
}

function nullifyUndefinedArrayItems(item: unknown): unknown {
  if (Array.isArray(item)) {
    return item.map((child) =>
      typeof child === 'undefined' ? null : nullifyUndefinedArrayItems(child),
    )
  }

  if (typeof item === 'object' && item !== null) {
    const obj = item as {[key: string]: any}
    return Object.keys(obj).reduce((acc: {[key: string]: any}, key: string) => {
      return {...acc, [key]: nullifyUndefinedArrayItems(obj[key])}
    }, {})
  }

  return item
}

/* eslint-disable no-process-env */
const enabled = process.env.ENABLE_INTEGRATION_TESTS || ''
const projectId = process.env.SANITY_TEST_PROJECT_ID || ''
const dataset = process.env.SANITY_TEST_DATASET || ''
const token = process.env.SANITY_TEST_TOKEN || ''
/* eslint-enable no-process-env */

const queue = new PQueue({concurrency: 4})
const lacksConfig = !enabled || !projectId || !dataset || !token
interface FixturePair {
  input: any
  output: any
}

type Fixture = JsonFixture | JsFixture

interface JsonFixture {
  file: string
  name?: string
  fixture: FixturePair
}

interface JsFixture {
  file: string
  name?: string
  fixture: {[key: string]: any}
}

describe(
  'integration tests',
  async () => {
    const fixturesDir = path.join(__dirname, 'fixtures')
    const jsonFixturesDir = path.join(fixturesDir, 'integration')

    const jsonFixtures: Fixture[] = fs
      .readdirSync(jsonFixturesDir)
      .filter((file) => /^\d+\.json$/.test(file))
      .map((file) => ({file, fixture: readJsonFixture(path.join(jsonFixturesDir, file))}))

    const rawJsFixtures: {file: string; fixture: JsFixture}[] = await Promise.all(
      fs
        .readdirSync(fixturesDir)
        .filter((file) => /\.ts$/.test(file))
        .map(async (file) => ({
          file,
          fixture: await readCodeFixture(path.join(fixturesDir, file)),
        })),
    )

    const jsFixtures = rawJsFixtures.reduce((acc: Fixture[], item: JsFixture) => {
      const entries = Object.keys(item.fixture)
      return acc.concat(
        entries.reduce((set: Fixture[], key: string) => {
          for (let x = 0; x < entries.length; x++) {
            // Don't diff against self
            if (key === entries[x]) {
              continue
            }

            const input = item.fixture[key]
            const output = item.fixture[entries[x]]
            const name = `${item.file} (${key} vs ${entries[x]})`
            set.push({file: item.file, name, fixture: {input, output}})
          }

          return set
        }, []),
      )
    }, [])

    const fixtures: Fixture[] = [...jsonFixtures, ...jsFixtures]

    fixtures.forEach((fix) => {
      test(fix.name || fix.file, async () => {
        const _type = 'test'
        const _id = `fix-${fix.name || fix.file}`
          .replace(/[^a-z0-9-]+/gi, '-')
          .replace(/(^-|-$)/g, '')

        const input = {...fix.fixture.input, _id, _type}
        const output = {...fix.fixture.output, _id, _type}
        const diff = diffPatch(input, output)

        let result

        if (lacksConfig) {
          result = applyPatches(input, diff)
        } else {
          const client = createClient({
            projectId: projectId || 'ci',
            dataset,
            token,
            useCdn: false,
            apiVersion: '2023-04-24',
          })
          const trx = client.transaction().createOrReplace(input).serialize()

          result = await queue.add(
            () =>
              client.transaction([...trx, ...diff]).commit({
                visibility: 'async',
                returnDocuments: true,
                returnFirst: true,
                dryRun: true,
              }),
            {throwOnTimeout: true, timeout: 10000},
          )
        }

        expect(omitIgnored(result)).toEqual(nullifyUndefinedArrayItems(omitIgnored(output)))
      })
    })
  },
  {
    timeout: 120000,
  },
)

function readJsonFixture(fixturePath: string) {
  const content = fs.readFileSync(fixturePath, {encoding: 'utf8'})
  try {
    return JSON.parse(content)
  } catch (err) {
    throw new Error(`Error reading fixture at ${fixturePath}: ${err.message}`)
  }
}

function readCodeFixture(fixturePath: string): Promise<JsFixture> {
  const module = import(fixturePath)
  return module.then((mod: any) => (mod.default || mod) as JsFixture)
}
