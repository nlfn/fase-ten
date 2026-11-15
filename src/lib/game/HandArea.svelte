<script lang="ts">
  // The player's hand and the buttons that act on it. The hand can be sorted by number or by color.
  import type { Card } from '../../engine'
  import CardView from '../CardView.svelte'
  import { sortHand } from '../gameText'
  import type { SortMode } from '../gameText'

  interface Props {
    hand: Card[]
    selectedIds: number[]
    /** The player has laid down this round, so the lay down button is gone. */
    laidDown: boolean
    /** You Pick: laying down opens a choice of phase. */
    yousee: boolean
    canLay: boolean
    canDiscard: boolean
    canUndo: boolean
    onLayDown: () => void
    onDiscard: () => void
    onUndo: () => void
    onToggle: (cardId: number) => void
  }
  let { hand, selectedIds, laidDown, yousee, canLay, canDiscard, canUndo, onLayDown, onDiscard, onUndo, onToggle }: Props = $props()

  let sortMode = $state<SortMode>('number')
  const sortedHand = $derived(sortHand(hand, sortMode))
</script>

<section class="hand-area" aria-label="Your hand">
  <div class="actions">
    {#if !laidDown}
      <button type="button" class="primary" disabled={!canLay} onclick={onLayDown}>
        {selectedIds.length > 1 ? 'Lay down selected' : yousee ? 'Lay down a phase' : 'Lay down phase'}
      </button>
    {/if}
    <button type="button" disabled={!canDiscard} onclick={onDiscard}>Discard</button>
    {#if canUndo}
      <button type="button" onclick={onUndo}>Undo last move</button>
    {/if}
    <button type="button" class="ghost" onclick={() => (sortMode = sortMode === 'number' ? 'color' : 'number')}>
      Sort by {sortMode === 'number' ? 'color' : 'number'}
    </button>
  </div>
  <div class="hand">
    {#each sortedHand as c (c.id)}
      <CardView card={c} selected={selectedIds.includes(c.id)} onclick={() => onToggle(c.id)} />
    {/each}
  </div>
</section>

<style>
  .hand-area {
    display: grid;
    gap: 0.6rem;
    padding-top: 0.3rem;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .actions button {
    padding: 0.7rem 0.75rem;
    font-size: 0.92rem;
  }
  .hand {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    padding: 0.5rem 0.2rem 0.3rem;
    min-height: 6rem;
  }

  @media (min-width: 720px) {
    .hand {
      flex-wrap: nowrap;
      justify-content: center;
    }
  }
</style>
