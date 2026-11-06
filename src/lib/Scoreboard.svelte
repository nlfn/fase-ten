<script lang="ts">
  import type { GameState } from '../engine'

  interface Props {
    game: GameState
    onClose: () => void
  }

  let { game, onClose }: Props = $props()

  let closeButton = $state<HTMLButtonElement>()
  $effect(() => closeButton?.focus())

  const history = $derived(game.scoreHistory ?? [])
  // Games saved before scores were recorded are missing their earlier rounds.
  const finishedRounds = $derived(game.status === 'playing' ? game.round - 1 : game.round)
  const missing = $derived(Math.max(0, finishedRounds - history.length))

  const totals = $derived(game.players.map((p) => p.score))
  const lowest = $derived(Math.min(...totals))

  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') onClose()
  }
</script>

<svelte:window onkeydown={keydown} />

<div class="modal-backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onClose()}>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="score-title">
    <h2 id="score-title">Scoreboard</h2>
    <p>Each box is the total after that round, with the points added in that round underneath. Lowest score is best.</p>

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
                  <td class:out={r.winner === i}>
                    <span class="total">{total}</span>
                    <span class="added">{r.winner === i ? 'out' : `+${r.points[i]}`}</span>
                  </td>
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
      <p class="legend"><span class="out-mark">out</span> went out that round (0 points)</p>
    {/if}
    <button type="button" class="primary" bind:this={closeButton} onclick={onClose}>Close</button>
  </div>
</div>

<style>
  .scroll {
    overflow-x: auto;
    max-height: 50vh;
    overflow-y: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }
  th,
  td {
    padding: 0.4rem 0.4rem;
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
  td.out .added,
  .out-mark {
    color: #7ff0a6;
    font-weight: 700;
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
  .note,
  .legend {
    font-size: 0.85rem;
  }
</style>
