<script lang="ts">
  // The summary after a round or a game: who went out, the points, the cards left in each hand and
  // what comes next. It can be tucked away into a bar at the bottom to look over the finished table.
  import { cardPoints, doneCount, isSingleRound, isSittingOut, phasesOf, targetPhase } from '../../engine'
  import type { GameState } from '../../engine'
  import CardView from '../CardView.svelte'
  import type { SheetTab } from '../Sheet.svelte'
  import { nextLabel, phaseLabel, progressLine, resultTitle, sortHand, tieNote } from '../gameText'

  interface Props {
    game: GameState
    /** True while the summary is tucked away and only the bar shows. */
    hidden: boolean
    onNext: () => void
    onExit: () => void
    onSheet: (tab: SheetTab) => void
  }
  let { game, hidden = $bindable(), onNext, onExit, onSheet }: Props = $props()

  const yousee = $derived(game.mode === 'yousee')
  const single = $derived(isSingleRound(game))
  const phases = $derived(phasesOf(game.phaseSet))
  const title = $derived(resultTitle(game))
  const note = $derived(tieNote(game))
  const next = $derived(nextLabel(game))

  let continueButton = $state<HTMLButtonElement>()
  $effect(() => {
    continueButton?.focus()
  })
</script>

{#if hidden}
  <div class="result-bar" role="status">
    <strong>{title}</strong>
    <button type="button" class="ghost" onclick={() => (hidden = false)}>Show results</button>
    {#if game.status === 'gameOver'}
      <button type="button" class="primary" onclick={onExit}>New game</button>
    {:else}
      <button type="button" class="primary" onclick={onNext}>{next}</button>
    {/if}
  </div>
{:else}
  <div class="overlay">
    <div class="panel" role="dialog" aria-modal="true" aria-labelledby="result-title">
      <h2 id="result-title">{title}</h2>
      {#if note}<p class="tie-note">{note}</p>{/if}
      <table>
        <thead>
          <tr><th scope="col">Player</th><th scope="col">This round</th><th scope="col">Total</th><th scope="col">Next</th></tr>
        </thead>
        <tbody>
          {#each game.players as p, i (i)}
            <tr>
              <th scope="row">{p.name}</th>
              <td>{game.roundResult?.tie?.how === 'round' && game.status === 'gameOver' ? '-' : (game.roundResult?.points[i] ?? 0)}</td>
              <td>{p.score}</td>
              <td>
                {#if single}
                  {game.roundResult?.completed[i] ? 'Laid down' : 'Did not lay down'}
                {:else if game.status === 'gameOver'}
                  {doneCount(p) >= phases.length ? 'Finished' : progressLine(game, i)}
                {:else if game.tieNext}
                  {@const entry = game.tieNext.find((e) => e.player === i)}
                  {entry ? `Tiebreaker, Phase ${entry.phase + 1}` : 'Sits out'}
                {:else if yousee}
                  {progressLine(game, i)}
                {:else}
                  {phaseLabel(game, targetPhase(game, i) ?? phases.length)}{game.roundResult?.completed[i] ? '' : ' (repeat)'}
                {/if}
                {#if !single && game.roundResult?.completed[i] && p.laid !== null}
                  <span class="sub">Completed Phase {p.laid + 1}</span>
                {/if}
              </td>
            </tr>
            <tr class="cards-row">
              <td colspan="4">
                {#if game.tiebreak && isSittingOut(game, i)}
                  <span class="breakdown">Sat out the tiebreaker</span>
                {:else if p.hand.length === 0}
                  <span class="breakdown">Went out with no cards left</span>
                {:else}
                  {@const left = sortHand(p.hand, 'number')}
                  <div class="left-cards">
                    {#each left as c (c.id)}
                      <CardView card={c} size="xs" />
                    {/each}
                  </div>
                  <span class="breakdown">
                    {left.map((c) => cardPoints(c)).join(' + ')} = {left.reduce((sum, c) => sum + cardPoints(c), 0)}
                  </span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      <div class="result-links">
        <button type="button" class="link" onclick={() => onSheet('scores')}>Scores</button>
        <button type="button" class="link" onclick={() => onSheet('phases')}>Phases</button>
      </div>
      <div class="result-actions">
        <button type="button" class="ghost big" onclick={() => (hidden = true)}>View table</button>
        {#if game.status === 'gameOver'}
          <button type="button" class="primary big" bind:this={continueButton} onclick={onExit}>New game</button>
        {:else}
          <button type="button" class="primary big" bind:this={continueButton} onclick={onNext}>{next}</button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .tie-note {
    margin: 0.2rem 0 0.8rem;
    font-size: 0.95rem;
    color: var(--gold);
  }
  .overlay {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 1rem;
    background: rgb(5 20 12 / 0.75);
    z-index: 10;
  }
  .panel {
    width: min(30rem, 100%);
    max-height: 100%;
    overflow-y: auto;
    padding: 1.4rem;
    border-radius: 1.1rem;
    background: var(--felt);
    box-shadow: 0 0 0 2px var(--gold);
    display: grid;
    gap: 1rem;
  }
  .panel h2 {
    margin: 0;
    font-size: 1.6rem;
    letter-spacing: -0.02em;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }
  th,
  td {
    padding: 0.4rem 0.3rem;
    text-align: left;
    border-bottom: 1px solid rgb(255 255 255 / 0.15);
  }
  thead th {
    font-size: 0.8rem;
    color: var(--text-dim);
    font-weight: 600;
  }
  .result-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.6rem;
  }
  .result-links {
    display: flex;
    justify-content: center;
    gap: 1.4rem;
  }
  .link {
    padding: 0.2rem 0.3rem;
    background: none;
    color: var(--gold);
    font-weight: 800;
    text-decoration: underline;
  }
  .result-bar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
    padding: 0.7rem max(0.9rem, env(safe-area-inset-right)) max(0.7rem, env(safe-area-inset-bottom))
      max(0.9rem, env(safe-area-inset-left));
    background: var(--felt);
    box-shadow:
      0 -2px 0 var(--gold),
      0 -0.5rem 1.5rem rgb(0 0 0 / 0.4);
  }
  .result-bar strong {
    flex: 1 1 0;
    min-width: 6rem;
  }
  .result-bar button {
    padding: 0.5rem 0.8rem;
    font-size: 0.9rem;
  }
  .cards-row td {
    padding-top: 0.2rem;
    padding-bottom: 0.6rem;
  }
  .left-cards {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .breakdown {
    display: block;
    margin-top: 0.3rem;
    font-size: 0.85rem;
    color: var(--text-dim);
  }
  .sub {
    display: block;
    font-size: 0.75rem;
    color: var(--gold);
  }
  .big {
    padding: 0.9rem;
    font-size: 1.1rem;
  }
</style>
