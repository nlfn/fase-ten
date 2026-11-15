<script lang="ts">
  // The groups laid down on the table, under the name of whoever laid them. With one card selected,
  // the groups it can be added to light up with a button for each place it can go.
  import { meldsOf, recentHitIds } from '../../engine'
  import type { GameState, HitTarget, Meld, RunEnd } from '../../engine'
  import CardView from '../CardView.svelte'
  import { HUMAN, meldTitle } from '../gameText'

  interface Props {
    game: GameState
    /** The groups the selected card can be added to, by group id. */
    hitMap: Map<number, HitTarget>
    onHit: (meldId: number, end?: RunEnd) => void
  }
  let { game, hitMap, onHit }: Props = $props()

  // Cards added to a group during the last full lap of the table, shown with an outline.
  const markedIds = $derived(recentHitIds(game))
  const anyMarked = $derived(game.melds.some((m) => m.cards.some((c) => markedIds.has(c.id))))
</script>

{#snippet meldView(m: Meld)}
  {@const target = hitMap.get(m.id)}
  <div class="meld" class:target={target !== undefined}>
    <div class="meld-title">{meldTitle(m)}</div>
    <div class="meld-cards">
      {#each m.cards as c (c.id)}
        <CardView card={c} size="xs" marked={markedIds.has(c.id)} />
      {/each}
    </div>
    {#if target}
      <div class="hit-row">
        {#if m.kind === 'run'}
          {#each target.ends as end (end)}
            <button type="button" class="chip" onclick={() => onHit(m.id, end)}>
              Add as {end === 'low' ? m.start - (m.step ?? 1) : m.end + (m.step ?? 1)}
            </button>
          {/each}
        {:else}
          <button type="button" class="chip" onclick={() => onHit(m.id)}>Add here</button>
        {/if}
      </div>
    {/if}
  </div>
{/snippet}

<section class="melds" aria-label="Groups on the table">
  {#if game.melds.length === 0}
    <p class="empty">Groups appear here once someone lays down a phase.</p>
  {:else}
    {#each game.players as p, i (i)}
      {@const owned = meldsOf(game, i)}
      {#if owned.length > 0}
        <div class="owner">
          <h2>{i === HUMAN ? 'Your groups' : `${p.name}'s groups`}</h2>
          <div class="owner-melds">
            {#each owned as m (m.id)}
              {@render meldView(m)}
            {/each}
          </div>
        </div>
      {/if}
    {/each}
    {#if anyMarked}
      <p class="legend"><span class="swatch" aria-hidden="true"></span>Outlined cards were added recently.</p>
    {/if}
  {/if}
</section>

<style>
  .melds {
    overflow: auto;
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 0.9rem 1.4rem;
    padding: 0.7rem;
    border-radius: 0.9rem;
    background: rgb(0 0 0 / 0.16);
    min-height: 5rem;
    max-height: 36dvh; /* keeps the hand and buttons on screen; extra groups scroll */
  }
  .melds .empty {
    margin: auto;
    color: var(--text-dim);
  }
  .owner h2 {
    margin: 0 0 0.35rem;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--text-dim);
  }
  .owner-melds {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }
  .meld {
    padding: 0.4rem 0.5rem 0.5rem;
    border-radius: 0.6rem;
    background: rgb(255 255 255 / 0.06);
    display: grid;
    gap: 0.3rem;
    align-content: start;
  }
  .meld.target {
    background: rgb(255 216 77 / 0.18);
    box-shadow: 0 0 0 2px var(--gold);
  }
  .meld-title {
    font-size: 0.75rem;
    color: var(--text-dim);
  }
  .meld-cards {
    display: flex;
    gap: 0.15rem;
    flex-wrap: wrap;
    max-width: 22rem;
  }
  .hit-row {
    display: flex;
    gap: 0.35rem;
    flex-wrap: wrap;
  }
  .chip {
    padding: 0.35rem 0.7rem;
    font-size: 0.85rem;
    border-radius: 99px;
    background: var(--gold);
    color: var(--ink);
  }
  .legend {
    margin: 0.2rem 0 0;
    font-size: 0.8rem;
    color: var(--text-dim);
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }
  .swatch {
    width: 0.8rem;
    height: 1.1rem;
    border-radius: 0.15rem;
    box-shadow: 0 0 0 2px #6ee7f9;
  }
</style>
