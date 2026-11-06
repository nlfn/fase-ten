<script lang="ts">
  export type PhaseStatus = 'done' | 'ready' | 'notyet'

  export interface PhaseOption {
    index: number
    description: string
    status: PhaseStatus
  }

  interface Props {
    options: PhaseOption[]
    usingSelection: boolean // true when the player picked specific cards
    onPick: (index: number) => void
    onClose: () => void
  }

  let { options, usingSelection, onPick, onClose }: Props = $props()

  let firstReady = $state<HTMLButtonElement>()
  $effect(() => firstReady?.focus())

  const firstReadyIndex = $derived(options.find((o) => o.status === 'ready')?.index)

  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') onClose()
  }
</script>

<svelte:window onkeydown={keydown} />

<div class="modal-backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onClose()}>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="picker-title">
    <h2 id="picker-title">Which phase are you laying down?</h2>
    <p>
      {usingSelection
        ? 'These are the phases your selected cards can make.'
        : 'These are the phases your hand can make right now.'}
      Once the cards are down, that phase is decided.
    </p>
    <ul>
      {#each options as o (o.index)}
        <li class={o.status}>
          <span class="num">{o.index + 1}</span>
          <span class="desc">{o.description}</span>
          {#if o.status === 'ready'}
            {#if o.index === firstReadyIndex}
              <button type="button" class="primary" bind:this={firstReady} onclick={() => onPick(o.index)}>
                Lay down
              </button>
            {:else}
              <button type="button" class="primary" onclick={() => onPick(o.index)}>Lay down</button>
            {/if}
          {:else if o.status === 'done'}
            <span class="state">✓ Done</span>
          {:else}
            <span class="state">Not yet</span>
          {/if}
        </li>
      {/each}
    </ul>
    <button type="button" class="ghost" onclick={onClose}>Cancel</button>
  </div>
</div>

<style>
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.35rem;
  }
  li {
    display: grid;
    grid-template-columns: 1.6rem 1fr auto;
    align-items: center;
    gap: 0.5rem;
    min-height: 2.9rem;
    padding: 0.25rem 0.6rem;
    border-radius: 0.7rem;
    background: rgb(0 0 0 / 0.18);
  }
  li.ready {
    background: rgb(255 216 77 / 0.14);
    box-shadow: 0 0 0 2px rgb(255 216 77 / 0.55) inset;
  }
  .num {
    color: var(--gold);
    font-weight: 800;
  }
  .desc {
    font-weight: 600;
    font-size: 0.95rem;
  }
  li.done .desc,
  li.notyet .desc {
    color: var(--text-dim);
    font-weight: 500;
  }
  .state {
    color: var(--text-dim);
    font-size: 0.85rem;
    font-weight: 700;
  }
  li.done .state {
    color: #7ff0a6;
  }
  li button {
    padding: 0.45rem 0.8rem;
    font-size: 0.9rem;
  }
</style>
