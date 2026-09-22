import {defineConfig} from '@sanity/pkg-utils'

export default defineConfig({
  bundleAnalyzer: process.env.ENABLE_BUNDLE_ANALYZER === 'true',
  tsconfig: 'tsconfig.dist.json',
})
