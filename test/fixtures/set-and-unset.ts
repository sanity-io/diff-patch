import * as nested from './nested'

export const a = {...nested.a, year: 1995, slug: {auto: true, ...nested.a.slug}, arr: [1, 2]}

export const b = {...nested.b, arr: [1, null]}
