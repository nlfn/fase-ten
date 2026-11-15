<script lang="ts">
  // The draw pile and the discard pile. Each can be tapped when it is the player's turn to draw.
  import type { Card } from '../../engine'
  import CardView from '../CardView.svelte'

  interface Props {
    /** Cards left in the draw pile. */
    drawCount: number
    /** The top of the discard pile, if there is one. */
    top: Card | null
    canDrawDeck: boolean
    canTakeDiscard: boolean
    onDrawDeck: () => void
    onTakeDiscard: () => void
  }
  let { drawCount, top, canDrawDeck, canTakeDiscard, onDrawDeck, onTakeDiscard }: Props = $props()
</script>

<div class="piles">
  <div class="pile-wrap">
    <button
      type="button"
      class="deck"
      disabled={!canDrawDeck}
      onclick={onDrawDeck}
      aria-label="Draw from the deck, {drawCount} cards left"
    >
      <span class="count">{drawCount}</span>
    </button>
    <span class="pile-label">Deck</span>
  </div>
  <div class="pile-wrap">
    {#if top}
      <CardView
        card={top}
        glow={canTakeDiscard}
        onclick={canTakeDiscard ? onTakeDiscard : undefined}
      />
    {:else}
      <div class="slot">Empty</div>
    {/if}
    <span class="pile-label">Discard</span>
  </div>
</div>

<style>
  .piles {
    display: flex;
    gap: 1rem;
  }
  .pile-wrap {
    display: grid;
    justify-items: center;
    gap: 0.3rem;
  }
  .pile-label {
    font-size: 0.78rem;
    color: var(--text-dim);
  }
  .deck,
  .slot {
    width: clamp(50px, 13.5vw, 76px);
    aspect-ratio: 5 / 7;
    border-radius: 0.5rem;
    display: grid;
    place-items: center;
    padding: 0;
  }
  .deck {
    background:
      repeating-linear-gradient(45deg, rgb(255 255 255 / 0.1) 0 6px, transparent 6px 12px),
      #1f4f9c;
    box-shadow:
      0 0 0 3px #fff inset,
      0 2px 4px rgb(0 0 0 / 0.4);
    color: #fff;
    font-weight: 800;
  }
  .deck:disabled {
    opacity: 1;
    filter: saturate(0.7) brightness(0.85);
  }
  .deck:not(:disabled) {
    box-shadow:
      0 0 0 3px #fff inset,
      0 0 0 3px var(--gold),
      0 2px 4px rgb(0 0 0 / 0.4);
  }
  .count {
    background: rgb(0 0 0 / 0.55);
    padding: 0.1rem 0.45rem;
    border-radius: 99px;
    font-size: 0.85rem;
  }
  .slot {
    border: 2px dashed rgb(255 255 255 / 0.3);
    color: var(--text-dim);
    font-size: 0.8rem;
  }
</style>
