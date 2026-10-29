const blocks = [
  {_key: 'a1', _type: 'block', text: 'Alpha'},
  {_key: 'b1', _type: 'block', text: 'Bravo'},
  {_key: 'c1', _type: 'block', text: 'Charlie'},
  {_key: 'd1', _type: 'block', text: 'Delta'},
  {_key: 'e1', _type: 'block', text: 'Echo'},
]

const [a1, b1, c1, d1, e1] = blocks

export const source = {_id: 'blocks', _type: 'article', body: blocks}

// Move the last block to the top
export const lastToTop = {...source, body: [e1, a1, b1, c1, d1]}

// Swap the second and third blocks
export const swapNeighbours = {...source, body: [a1, c1, b1, d1, e1]}

// Move the first block to the end
export const firstToEnd = {...source, body: [b1, c1, d1, e1, a1]}

// Move the last block to the top and edit the text of a block that stays put
export const moveWithStableEdit = {
  ...source,
  body: [e1, a1, {...b1, text: 'Bravo Two'}, c1, d1],
}

// Move the last block to the top, remove the third and add a new one after the first
export const moveWithAddAndRemove = {
  ...source,
  body: [e1, a1, {_key: 'f1', _type: 'block', text: 'Foxtrot'}, b1, d1],
}

// Move the last block to the top and change its text
export const moveWithChangedContent = {
  ...source,
  body: [{...e1, text: 'Echo Two'}, a1, b1, c1, d1],
}
