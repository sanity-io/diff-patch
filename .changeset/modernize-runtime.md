---
'@sanity/diff-patch': major
---

Require Node.js 22.12.0 or later and ship ES modules only. The CommonJS build has been removed. Use ESM imports when consuming this package.

Upgrade `@sanity/diff-match-patch` to fix UTF-8 byte lengths in patches containing emoji and other characters outside the Basic Multilingual Plane.
