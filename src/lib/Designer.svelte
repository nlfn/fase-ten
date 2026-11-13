<script lang="ts">
  import { HAND_LIMIT, MAX_GROUPS, decodeGroups, describeGroups, encodeGroups, groupsProblem } from '../engine'
  import type { GroupSpec } from '../engine'
  import type { SavedPhase } from './storage'

  interface Props {
    /** The phase to start from, as a code. */
    code: string
    saved: SavedPhase[]
    /** Called with the phase code every time the design is valid, so the welcome screen always shows it. */
    onChange: (code: string) => void
    onSave: (name: string, code: string) => void
    onDelete: (id: string) => void
    onClose: () => void
  }

  let { code: startCode, saved, onChange, onSave, onDelete, onClose }: Props = $props()

  type Choice = 'set' | 'run' | 'color' | 'even' | 'odd' | 'colorRun' | 'rainbow'

  const CHOICES: { id: Choice; label: string }[] = [
    { id: 'set', label: 'Set' },
    { id: 'run', label: 'Run' },
    { id: 'color', label: 'All one color' },
    { id: 'even', label: 'Run of evens' },
    { id: 'odd', label: 'Run of odds' },
    { id: 'colorRun', label: 'Run in one color' },
    { id: 'rainbow', label: 'Rainbow run' },
  ]

  const choiceOf = (g: GroupSpec): Choice =>
    g.kind === 'parity' ? (g.parity === 'odd' ? 'odd' : 'even') : g.kind

  function specOf(choice: Choice, size: number, noWild: boolean): GroupSpec {
    let spec: GroupSpec
    if (choice === 'even' || choice === 'odd') spec = { kind: 'parity', size: Math.min(size, 6), parity: choice === 'odd' ? 'odd' : 'even' }
    else if (choice === 'rainbow') spec = { kind: 'rainbow', size: Math.max(4, Math.round(size / 4) * 4) }
    else spec = { kind: choice, size }
    if (noWild) spec.noWild = true
    return spec
  }

  const stepOf = (g: GroupSpec) => (g.kind === 'rainbow' ? 4 : 1)
  const maxOf = (g: GroupSpec) => (g.kind === 'parity' ? 6 : g.kind === 'set' || g.kind === 'color' ? HAND_LIMIT : 12)

  // svelte-ignore state_referenced_locally
  let groups = $state<GroupSpec[]>(decodeGroups(startCode) ?? [{ kind: 'set', size: 3 }])

  const code = $derived(encodeGroups(groups))
  const problem = $derived(groupsProblem(groups))
  const name = $derived(problem ? '' : describeGroups(groups))
  const total = $derived(groups.reduce((n, g) => n + g.size, 0))

  // Whatever is valid is what the welcome screen offers, so closing this never loses the design.
  $effect(() => {
    if (!problem) onChange(code)
  })

  function change(i: number, patch: (g: GroupSpec) => GroupSpec) {
    groups = groups.map((g, k) => (k === i ? patch(g) : g))
  }
  function setChoice(i: number, choice: Choice) {
    change(i, (g) => specOf(choice, g.size, !!g.noWild))
  }
  function bump(i: number, direction: 1 | -1) {
    change(i, (g) => {
      const size = g.size + direction * stepOf(g)
      const lo = g.kind === 'rainbow' ? 4 : 2
      return { ...g, size: Math.min(maxOf(g), Math.max(lo, size)) }
    })
  }
  function toggleNoWild(i: number) {
    change(i, (g) => {
      const next = { ...g }
      if (next.noWild) delete next.noWild
      else next.noWild = true
      return next
    })
  }
  function add() {
    if (groups.length < MAX_GROUPS) groups = [...groups, { kind: 'set', size: 3 }]
  }
  function remove(i: number) {
    groups = groups.filter((_, k) => k !== i)
  }

  // Saving under a name.
  let label = $state('')
  const saveName = $derived(label.trim() || name)

  // Sharing: a link that opens the welcome screen on this phase, or the bare code.
  const link = $derived(`${location.origin}${location.pathname}?phase=${code}`)
  let note = $state('')
  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text)
      note = `${what} copied`
    } catch {
      note = `Copy it by hand: press and hold the ${what.toLowerCase()} above`
    }
  }

  // Loading a code or a link someone sent.
  let incoming = $state('')
  let incomingProblem = $state('')
  function load() {
    const text = incoming.trim()
    let candidate = text
    try {
      candidate = new URL(text).searchParams.get('phase') ?? text
    } catch {
      // Not a link, so it is a bare code.
    }
    const loaded = decodeGroups(candidate)
    if (loaded) {
      groups = loaded
      incoming = ''
      incomingProblem = ''
    } else {
      incomingProblem = 'That is not a phase code or link.'
    }
  }

  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') onClose()
  }
</script>

<svelte:window onkeydown={keydown} />

<div class="modal-backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onClose()}>
  <div class="modal designer" role="dialog" aria-modal="true" aria-label="Design a phase">
    <div class="head">
      <h2>Design a phase</h2>
      <button class="ghost close" onclick={onClose} aria-label="Close">×</button>
    </div>

    <ul class="groups">
      {#each groups as g, i (i)}
        <li class="group">
          <div class="row">
            <select value={choiceOf(g)} onchange={(e) => setChoice(i, e.currentTarget.value as Choice)} aria-label="Kind of group {i + 1}">
              {#each CHOICES as c (c.id)}
                <option value={c.id}>{c.label}</option>
              {/each}
            </select>
            <button class="ghost remove" onclick={() => remove(i)} aria-label="Remove group {i + 1}" disabled={groups.length === 1}>×</button>
          </div>
          <div class="row">
            <div class="stepper">
              <button class="ghost" onclick={() => bump(i, -1)} aria-label="Fewer cards">−</button>
              <span class="size" aria-live="polite">{g.size}</span>
              <button class="ghost" onclick={() => bump(i, 1)} aria-label="More cards">+</button>
            </div>
            <label class="nowild">
              <input type="checkbox" checked={!!g.noWild} onchange={() => toggleNoWild(i)} />
              <span>No Wilds</span>
            </label>
          </div>
        </li>
      {/each}
    </ul>

    <button class="ghost" onclick={add} disabled={groups.length >= MAX_GROUPS}>Add a group</button>

    <div class="summary" class:bad={!!problem}>
      {#if problem}
        <p class="problem">{problem}</p>
      {:else}
        <p class="name">{name}</p>
      {/if}
      <p class="count">{total} of {HAND_LIMIT} cards</p>
    </div>

    <section>
      <h3>Save it</h3>
      <div class="row">
        <input type="text" bind:value={label} placeholder={name || 'Name'} maxlength="60" aria-label="Name for this phase" />
        <button class="primary" disabled={!!problem} onclick={() => onSave(saveName, code)}>Save</button>
      </div>
    </section>

    {#if saved.length > 0}
      <section>
        <h3>My phases</h3>
        <ul class="saved">
          {#each saved as s (s.id)}
            <li>
              <span class="sname">{s.name}</span>
              <button class="ghost" onclick={() => (groups = decodeGroups(s.code) ?? groups)}>Edit</button>
              <button class="ghost" onclick={() => onDelete(s.id)} aria-label="Delete {s.name}">Delete</button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <section>
      <h3>Share</h3>
      <input class="code" type="text" readonly value={problem ? '' : code} aria-label="Phase code" onfocus={(e) => e.currentTarget.select()} />
      <div class="row">
        <button class="ghost" disabled={!!problem} onclick={() => copy(code, 'Code')}>Copy code</button>
        <button class="ghost" disabled={!!problem} onclick={() => copy(link, 'Link')}>Copy link</button>
      </div>
      <div class="row">
        <input type="text" bind:value={incoming} placeholder="Paste a code or link" aria-label="Code or link to load" />
        <button class="ghost" disabled={!incoming.trim()} onclick={load}>Load</button>
      </div>
      {#if incomingProblem}<p class="problem">{incomingProblem}</p>{/if}
      {#if note}<p class="note" aria-live="polite">{note}</p>{/if}
    </section>

    <button class="primary" onclick={onClose} disabled={!!problem}>Done</button>
  </div>
</div>

<style>
  .designer {
    gap: 0.8rem;
    grid-template-columns: minmax(0, 1fr);
  }
  .group,
  .row,
  section {
    min-width: 0;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
  }
  .close {
    padding: 0.2rem 0.7rem;
    font-size: 1.3rem;
    line-height: 1.2;
  }
  h3 {
    margin: 0 0 0.4rem;
    font-size: 0.95rem;
    color: var(--text-dim);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.6rem;
  }
  .group {
    background: var(--felt-deep);
    border-radius: 0.8rem;
    padding: 0.6rem;
    display: grid;
    gap: 0.5rem;
  }
  .row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  select,
  input[type='text'] {
    font: inherit;
    min-width: 0;
    flex: 1;
    padding: 0.6rem 0.7rem;
    border-radius: 0.6rem;
    border: 2px solid transparent;
    background: var(--felt);
    color: var(--text);
  }
  select:focus-visible,
  input[type='text']:focus-visible {
    outline: none;
    border-color: var(--gold);
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }
  .stepper button,
  .remove {
    padding: 0.4rem 0.7rem;
  }
  .size {
    min-width: 1.6rem;
    text-align: center;
    font-weight: 800;
    font-size: 1.1rem;
  }
  .nowild {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text-dim);
    font-size: 0.9rem;
  }
  .nowild input {
    width: 1.2rem;
    height: 1.2rem;
    accent-color: var(--gold);
  }
  .summary {
    background: var(--felt-deep);
    border-radius: 0.8rem;
    padding: 0.6rem 0.8rem;
  }
  .summary.bad {
    box-shadow: 0 0 0 2px #e5534b inset;
  }
  .summary p {
    margin: 0;
  }
  .name {
    color: var(--text);
    font-weight: 800;
    font-size: 1.1rem;
  }
  .count {
    margin-top: 0.15rem;
  }
  .problem {
    color: #ff9c95;
    font-size: 0.9rem;
  }
  .note {
    margin-top: 0.4rem;
  }
  .saved li {
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }
  .sname {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
    font-weight: 700;
  }
  .saved button {
    padding: 0.35rem 0.7rem;
  }
  .code {
    width: 100%;
    margin-bottom: 0.5rem;
    font-family: ui-monospace, monospace;
  }
  section .row + .row {
    margin-top: 0.5rem;
  }
</style>
