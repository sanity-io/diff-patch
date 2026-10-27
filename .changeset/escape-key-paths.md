---
'@sanity/diff-patch': patch
---

Accept any non-empty string as an array item `_key`. Keys are now escaped inside patch paths, so keys with spaces, quotes, backslashes or a single character no longer throw `Invalid key - use less exotic characters`. Empty keys still throw.
