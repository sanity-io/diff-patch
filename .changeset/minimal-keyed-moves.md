---
'@sanity/diff-patch': patch
---

Only move keyed array items whose order changed. Reorders of keyed arrays are now written as an `unset` and an `insert` of each moved item, chosen so that as few items as possible move. Items that only shift position are no longer rewritten, so concurrent edits inside them are kept.
