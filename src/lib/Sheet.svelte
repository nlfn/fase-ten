<script lang="ts">
  import type { GameState } from '../engine'
  import PhasesTab from './PhasesTab.svelte'
  import ScoresTab from './ScoresTab.svelte'

  export type SheetTab = 'scores' | 'phases'

  interface Props {
    game: GameState
    /** The tab to open on. */
    start: SheetTab
    onClose: () => void
  }

  let { game, start, onClose }: Props = $props()

  const TABS: { id: SheetTab; label: string }[] = [
    { id: 'scores', label: 'Scores' },
    { id: 'phases', label: 'Phases' },
  ]

  // Opens on the tab that was asked for; the player moves between them from there.
  let tab = $state<SheetTab>(start)
  const index = $derived(TABS.findIndex((t) => t.id === tab))

  const tabButtons: Record<string, HTMLButtonElement | undefined> = {}
  $effect(() => tabButtons[start]?.focus({ preventScroll: true }))

  function go(step: number) {
    const next = TABS[index + step]
    if (next) tab = next.id
  }

  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') onClose()
    else if (event.key === 'ArrowRight') go(1)
    else if (event.key === 'ArrowLeft') go(-1)
  }

  // A mostly sideways drag switches tab. A mostly up and down one is just scrolling a table.
  let startX = 0
  let startY = 0
  function touchStart(event: TouchEvent) {
    startX = event.touches[0].clientX
    startY = event.touches[0].clientY
  }
  function touchEnd(event: TouchEvent) {
    const dx = event.changedTouches[0].clientX - startX
    const dy = event.changedTouches[0].clientY - startY
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return
    go(dx < 0 ? 1 : -1)
  }
</script>

<svelte:window onkeydown={keydown} />

<div class="modal-backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onClose()}>
  <div class="modal sheet" role="dialog" aria-modal="true" aria-label="Scores and phases">
    <div class="head">
      <div class="tabs" role="tablist">
        {#each TABS as t (t.id)}
          <button
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="sheet-panel"
            class:on={tab === t.id}
            bind:this={tabButtons[t.id]}
            onclick={() => (tab = t.id)}
          >
            {t.label}
          </button>
        {/each}
      </div>
      <button type="button" class="x" aria-label="Close" onclick={onClose}>&times;</button>
    </div>
    <div
      class="body"
      id="sheet-panel"
      role="tabpanel"
      aria-labelledby={`tab-${tab}`}
      ontouchstart={touchStart}
      ontouchend={touchEnd}
    >
      <!-- Both tabs are built as soon as the sheet opens, so switching only has to show one. The one
           that is not showing stays laid out at full width but is clipped to nothing and not painted. -->
      <div class="pane" class:off={tab !== 'scores'} inert={tab !== 'scores'}>
        <ScoresTab {game} />
      </div>
      <div class="pane" class:off={tab !== 'phases'} inert={tab !== 'phases'}>
        <PhasesTab {game} />
      </div>
    </div>
    <div class="dots" aria-hidden="true">
      {#each TABS as t (t.id)}<i class:on={tab === t.id}></i>{/each}
    </div>
  </div>
</div>

<style>
  /* A fixed height, so the sheet does not jump in size when you change tab. */
  .sheet {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 0;
    height: min(40rem, calc(100dvh - 2rem));
    overflow: hidden;
  }
  .head {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.4rem 0.6rem 0 1rem;
    border-bottom: 1px solid rgb(255 255 255 / 0.15);
  }
  .tabs {
    display: flex;
    gap: 0.2rem;
  }
  .tabs button {
    padding: 0.7rem 0.8rem 0.55rem;
    border-radius: 0;
    background: transparent;
    border-bottom: 3px solid transparent;
    font-size: 1.05rem;
    font-weight: 800;
    color: var(--text-dim);
  }
  .tabs button.on {
    color: var(--text);
    border-bottom-color: var(--gold);
  }
  .x {
    padding: 0.2rem 0.6rem;
    font-size: 1.6rem;
    line-height: 1;
    background: transparent;
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    /* No padding at the top, so a pinned table header sits flush against the edge. */
    padding: 0 1rem 0.6rem;
    display: grid;
    align-content: start;
    gap: 0.7rem;
    overscroll-behavior: contain;
    position: relative; /* the pane that is not showing is placed against this */
  }
  .pane {
    display: grid;
    gap: 0.7rem;
    margin-top: 0.8rem;
  }
  .pane.off {
    position: absolute;
    top: 0;
    left: 1rem;
    right: 1rem;
    height: 0;
    margin: 0;
    overflow: hidden;
    visibility: hidden;
  }
  .dots {
    flex: none;
    display: flex;
    justify-content: center;
    gap: 0.4rem;
    padding: 0.4rem 0 0.8rem;
  }
  .dots i {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: rgb(255 255 255 / 0.25);
  }
  .dots i.on {
    background: var(--gold);
  }
</style>
