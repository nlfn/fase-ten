// Phases as text. A code such as "s3-s3" or "r4-s3" lists the groups of one phase, which lets a single
// round or a custom phase live inside a saved game or a shared link without a lookup table.
//
// One part per group: a letter, the size, then "c" for one color and "n" for no Wilds.
//   s set, r run, c all one color, e run of evens, o run of odds, b rainbow run,
//   k run in one color (the same as "r" with the "c" switch, and always written as "k").

import { groupsProblem } from './spec'
import type { GroupSpec } from './spec'

function letterOf(g: GroupSpec): string {
  if (g.kind === 'set') return 's'
  if (g.kind === 'color') return 'c'
  if (g.rainbow) return 'b'
  if (g.parity) return g.parity === 'odd' ? 'o' : 'e'
  return g.oneColor ? 'k' : 'r'
}

export function encodeGroups(groups: readonly GroupSpec[]): string {
  return groups
    .map((g) => {
      const letter = letterOf(g)
      // "k" already says one color.
      return letter + g.size + (g.oneColor && letter !== 'k' ? 'c' : '') + (g.noWild ? 'n' : '')
    })
    .join('-')
}

export function decodeGroups(code: string): GroupSpec[] | null {
  const specs: GroupSpec[] = []
  for (const part of code.split('-')) {
    const m = /^([screkbpo])(\d{1,2})(c?)(n?)$/.exec(part)
    if (!m) return null
    const size = Number(m[2])
    const oneColor = m[3] === 'c'
    // The letters that are one color already say so, so the switch on them is only a mistake.
    if (oneColor && (m[1] === 'c' || m[1] === 'k')) return null
    let spec: GroupSpec
    switch (m[1]) {
      case 's': spec = { kind: 'set', size }; break
      case 'c': spec = { kind: 'color', size }; break
      case 'k': spec = { kind: 'run', size, oneColor: true }; break
      case 'b': spec = { kind: 'run', size, rainbow: true }; break
      case 'e': spec = { kind: 'run', size, parity: 'even' }; break
      case 'o': spec = { kind: 'run', size, parity: 'odd' }; break
      default: spec = { kind: 'run', size }
    }
    if (oneColor) spec.oneColor = true
    // 'p' (a run with no Wilds) is how the first single round codes spelled it.
    if (m[4] === 'n' || m[1] === 'p') spec.noWild = true
    specs.push(spec)
  }
  return groupsProblem(specs) === null ? specs : null
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? `1 ${one}` : `${n} ${many}`
}

/** A plain-English name built from the groups alone, such as "2 sets of 3 + 1 run of 4 (no wilds)". */
export function nameGroups(groups: readonly GroupSpec[]): string {
  const parts: string[] = []
  for (let i = 0; i < groups.length; ) {
    let j = i
    while (j < groups.length && encodeGroups([groups[j]]) === encodeGroups([groups[i]])) j++
    const g = groups[i]
    const n = j - i
    let part: string
    if (g.kind === 'set') part = `${plural(n, 'set', 'sets')} of ${g.size}`
    else if (g.kind === 'color') part = n === 1 ? `${g.size} of one color` : `${n} groups of ${g.size} of one color`
    else if (g.rainbow) part = `${plural(n, 'rainbow run', 'rainbow runs')} of ${g.size}`
    else if (g.parity) part = `${plural(n, 'run', 'runs')} of ${g.size} ${g.parity === 'odd' ? 'odds' : 'evens'}`
    else part = `${plural(n, 'run', 'runs')} of ${g.size}`
    const notes = [g.oneColor ? 'one color' : '', g.noWild ? 'no wilds' : ''].filter(Boolean)
    if (notes.length > 0) part += ` (${notes.join(', ')})`
    parts.push(part)
    i = j
  }
  return parts.join(' + ')
}
