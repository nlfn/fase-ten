<script lang="ts">
  import type { GameState } from '../engine'

  interface Props {
    game: GameState
  }

  let { game }: Props = $props()

  const history = $derived(game.scoreHistory ?? [])
  // Games saved before scores were recorded are missing their earlier rounds.
  const finishedRounds = $derived(game.status === 'playing' ? game.round - 1 : game.round)
  const missing = $derived(Math.max(0, finishedRounds - history.length))

  const totals = $derived(game.players.map((p) => p.score))
  const lowest = $derived(Math.min(...totals))
</script>

<p>Each entry is the total after that round, with the points added in that round underneath. Lowest score is best.</p>

{#if history.length === 0}
  <p class="none">No rounds have finished yet.</p>
{:else}
  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th scope="col">Round</th>
          {#each game.players as p, i (i)}
            <th scope="col" class="who">{p.name}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each history as r (r.round)}
          <tr>
            <th scope="row">{r.round}</th>
            {#each r.totals as total, i (i)}
              {#if r.winner === i}
                <td class="out">
                  <span class="boxed">
                    <span class="total">{total}</span>
                    <span class="added good">+0<span class="sr"> went out</span></span>
                  </span>
                </td>
              {:else if r.shutOut?.[i]}
                <td>
                  <span class="total">{total}</span>
                  <span class="added fire">+{r.points[i]}</span>
                  <span class="tag">shut out</span>
                </td>
              {:else}
                <td>
                  <span class="total">{total}</span>
                  <span class="added" class:good={r.laid?.[i] === true} class:bad={r.laid?.[i] === false}>
                    +{r.points[i]}{#if r.laid?.[i] === true}<span class="sr"> laid down</span>{:else if r.laid?.[i] === false}<span class="sr"> caught with a full hand</span>{/if}
                  </span>
                </td>
              {/if}
            {/each}
          </tr>
        {/each}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">Now</th>
          {#each totals as total, i (i)}
            <td class:lead={total === lowest}>
              <span class="total">{total}</span>
            </td>
          {/each}
        </tr>
      </tfoot>
    </table>
  </div>
  {#if missing > 0}
    <p class="note">
      {missing === 1 ? 'One earlier round was' : `${missing} earlier rounds were`} played before scores were kept,
      so {missing === 1 ? 'it is' : 'they are'} not listed. The totals are still right.
    </p>
  {/if}
{/if}

<style>
  .scroll {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }
  th,
  td {
    padding: 0.4rem 0.2rem;
    border-bottom: 1px solid rgb(255 255 255 / 0.15);
    text-align: center;
  }
  thead th {
    position: sticky;
    top: 0;
    background: var(--felt);
    font-size: 0.8rem;
    color: var(--text-dim);
  }
  tbody th,
  tfoot th {
    font-size: 0.85rem;
    color: var(--text-dim);
    font-weight: 700;
  }
  .who {
    max-width: 6rem;
    overflow-wrap: anywhere;
  }
  td {
    line-height: 1.15;
  }
  .total {
    display: block;
    font-size: 1.1rem;
    font-weight: 800;
  }
  .added {
    display: block;
    font-size: 0.75rem;
    color: var(--text-dim);
  }
  .added.good {
    color: #7ff0a6;
    font-weight: 700;
  }
  .added.bad {
    color: #ff7a7a;
    font-weight: 700;
  }
  /* Whoever went out gets a box around their score. */
  .boxed {
    display: inline-block;
    min-width: 2.4rem;
    padding: 0.12rem 0.5rem 0.1rem;
    border: 2px solid #7ff0a6;
    border-radius: 0.55rem;
  }
  /* Caught without ever getting a turn: the points are painted orange to red. */
  .added.fire {
    font-size: 1rem;
    font-weight: 900;
    background: linear-gradient(#fff3a0, #ffb300 40%, #ff3d00 75%, #a80000);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    -webkit-text-fill-color: transparent;
  }
  .tag {
    display: block;
    white-space: nowrap; /* "shut out" stays on one line, so the cell does not get taller */
    font-size: 0.5rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #ffb347;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  tfoot td {
    background: rgb(0 0 0 / 0.18);
  }
  tfoot td.lead .total {
    color: var(--gold);
  }
  tfoot th {
    background: rgb(0 0 0 / 0.18);
  }
  .none,
  .note {
    font-size: 0.85rem;
  }
</style>
