export const a = {
  _id: 'die-hard-iii',
  title: 'Die Hard with a Vengeance',
  characters: [
    {_key: 'john', name: 'John McClane'},
    {_key: 'simon', name: 'Simon Gruber'},
    {_key: 'zeus', name: 'Zeus Carver'},
  ],
}

// Simple reorder: swap first two items
export const b = {
  _id: 'die-hard-iii',
  title: 'Die Hard with a Vengeance',
  characters: [
    {_key: 'simon', name: 'Simon Gruber'},
    {_key: 'john', name: 'John McClane'},
    {_key: 'zeus', name: 'Zeus Carver'},
  ],
}

// Complex reorder: completely reverse the array
export const c = {
  _id: 'die-hard-iii',
  title: 'Die Hard with a Vengeance',
  characters: [
    {_key: 'zeus', name: 'Zeus Carver'},
    {_key: 'simon', name: 'Simon Gruber'},
    {_key: 'john', name: 'John McClane'},
  ],
}

// Reorder with content change: move zeus to front and change his name
export const d = {
  _id: 'die-hard-iii',
  title: 'Die Hard with a Vengeance',
  characters: [
    {_key: 'zeus', name: 'Zeus Carver Jr.'},
    {_key: 'john', name: 'John McClane'},
    {_key: 'simon', name: 'Simon Gruber'},
  ],
}

// Complex scenario: reorder + insertion + deletion
// - Remove simon (deletion)
// - Add hans as new villain (insertion)
// - Reorder zeus to front, john to end (reordering)
export const e = {
  _id: 'die-hard-iii',
  title: 'Die Hard with a Vengeance',
  characters: [
    {_key: 'zeus', name: 'Zeus Carver'},
    {_key: 'hans', name: 'Hans Gruber'},
    {_key: 'john', name: 'John McClane'},
  ],
}

// Complex scenario with size change: reorder + multiple insertions + deletion
// - Remove simon (deletion)
// - Add hans and karl as new villains (2 insertions)
// - Reorder zeus to front, john to middle (reordering)
// Result: array grows from 3 to 4 items
export const f = {
  _id: 'die-hard-iii',
  title: 'Die Hard with a Vengeance',
  characters: [
    {_key: 'zeus', name: 'Zeus Carver'},
    {_key: 'john', name: 'John McClane'},
    {_key: 'hans', name: 'Hans Gruber'},
    {_key: 'karl', name: 'Karl Vreski'},
  ],
}
