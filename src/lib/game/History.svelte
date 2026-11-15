<script lang="ts">
  // Recent plays, one row per turn, newest first. A name chip shows one player's turns only.
  import type { GameState } from '../../engine'
  import CardView from '../CardView.svelte'
  import { groupTurns } from '../turns'

  interface Props {
    game: GameState
  }
  let { game }: Props = $props()

  // One row per turn, newest first. Older turns scroll.
  const allTurns = $derived(groupTurns(game.events).reverse())
  // Show only one player's turns when a name chip is picked (null means everyone).
  let historyFilter = $state<number | null>(null)
  const history = $derived(
    historyFilter === null ? allTurns.slice(0, 14) : allTurns.filter((t) => t.player === historyFilter).slice(0, 12),
  )

  const ownerLabel = (owner: number, player: number): string =>
    owner === player ? 'their own group' : `${game.players[owner].name}'s group`
</script>

{#if allTurns.length > 0}
  <details class="history" open>
    <summary>Recent plays</summary>
    <div class="filters" role="group" aria-label="Show plays by">
      <button type="button" class="fchip" aria-pressed={historyFilter === null} onclick={() => (historyFilter = null)}>
        All
      </button>
      {#each game.players as p, i (i)}
        <button
          type="button"
          class="fchip p{i % 4}"
          aria-pressed={historyFilter === i}
          onclick={() => (historyFilter = historyFilter === i ? null : i)}
        >
          {p.name}
        </button>
      {/each}
    </div>
    {#if history.length === 0}
      <p class="none">{game.players[historyFilter ?? 0].name} has not played yet this round.</p>
    {/if}
    <ol>
      {#each history as t, i (i)}
        {@const name = game.players[t.player].name}
        {#if t.skipped}
          <li class="p{t.player % 4} lost">
            <span class="who">{name}</span>
            <span class="step">lost a turn to a Skip</span>
          </li>
        {:else}
          <li class="p{t.player % 4}">
            <span class="who">{name}</span>
            {#each t.steps as step}
              <span class="step">
                {#if step.kind === 'draw'}
                  drew
                {:else if step.kind === 'pickup'}
                  took <CardView card={step.card} size="chip" />
                {:else if step.kind === 'laydown'}
                  laid down Phase {step.phase + 1}
                {:else if step.kind === 'hit'}
                  added
                  {#each step.cards as c (c.id)}<CardView card={c} size="chip" />{/each}
                  to {ownerLabel(step.owner, t.player)}
                {:else if step.kind === 'discard'}
                  discarded <CardView card={step.card} size="chip" />
                {:else}
                  played Skip on {game.players[step.target].name} <CardView card={step.card} size="chip" />
                {/if}
              </span>
            {/each}
          </li>
        {/if}
      {/each}
    </ol>
  </details>
{/if}

<style>
  .history {
    flex: 1 1 100%;
    border-radius: 0.7rem;
    background: var(--felt-deep);
    padding: 0.45rem 0.7rem;
  }
  .history summary {
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--text-dim);
  }
  .history .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.4rem;
  }
  .history .fchip {
    min-height: 1.9rem;
    padding: 0.15rem 0.7rem;
    border-radius: 999px;
    border: 2px solid var(--who, rgb(255 255 255 / 0.5));
    background: transparent;
    color: var(--text);
    font-size: 0.8rem;
    font-weight: 700;
  }
  .history .fchip[aria-pressed='true'] {
    background: var(--who, #fff);
    color: var(--ink);
  }
  .history .none {
    margin: 0.4rem 0 0;
    color: var(--text-dim);
    font-size: 0.85rem;
  }
  .history ol {
    list-style: none;
    margin: 0.4rem 0 0;
    padding: 0;
    max-height: 10rem;
    overflow-y: auto;
  }
  .history li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.15rem 0.4rem;
    padding: 0.25rem 0.4rem 0.25rem 0.5rem;
    border-left: 4px solid var(--who, #fff);
    font-size: 0.8rem;
    min-height: 1.9rem;
  }
  .history li + li {
    margin-top: 0.3rem;
  }
  .history .who {
    font-weight: 800;
    color: var(--who, #fff);
  }
  .history .step {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.2rem;
  }
  /* A small arrow between the parts of a turn: took 10, then discarded 11. */
  .history .step + .step::before {
    content: '→';
    margin-right: 0.2rem;
    color: var(--text-dim);
  }
  .history li.lost {
    color: var(--text-dim);
    font-style: italic;
    opacity: 0.85;
  }
  .history li:first-child {
    background: rgb(255 255 255 / 0.06);
  }
  .p0 {
    --who: #ffd84d;
  }
  .p1 {
    --who: #6ee7f9;
  }
  .p2 {
    --who: #ff9ec7;
  }
  .p3 {
    --who: #b9f27c;
  }
</style>
