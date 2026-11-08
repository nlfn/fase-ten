<script lang="ts">
  import { PHASES, targetPhase } from '../engine'
  import type { GameState } from '../engine'

  interface Props {
    game: GameState
  }

  let { game }: Props = $props()

  type Mark = 'done' | 'laid' | 'now' | 'open'

  // done: completed in an earlier round. laid: laid down this round (counts once the round ends).
  // now: the phase a classic player is working on. open: not yet.
  function mark(playerIndex: number, phaseIndex: number): Mark {
    const p = game.players[playerIndex]
    if (p.done[phaseIndex]) return 'done'
    if (p.laidDown && p.laidPhase === phaseIndex) return 'laid'
    if (targetPhase(game, p) === phaseIndex) return 'now'
    return 'open'
  }

  const SYMBOL: Record<Mark, string> = { done: '✓', laid: '●', now: '▸', open: '' }
  const WORDS: Record<Mark, string> = {
    done: 'completed',
    laid: 'laid down this round',
    now: 'working on it',
    open: 'not yet',
  }
</script>

<p>
  {game.mode === 'yousee'
    ? 'Each player can complete the phases in any order, once each.'
    : game.mode === 'random'
      ? 'Each player has their own secret order. You can only see the phase each player is on.'
      : game.mode === 'reverse'
        ? 'Backwards: players work backwards, from Phase 10 down to Phase 1.'
        : 'Players work through the phases in order.'}
</p>
<div class="scroll">
  <table>
    <thead>
      <tr>
        <th scope="col">Phase</th>
        {#each game.players as p, i (i)}
          <th scope="col" class="who">{p.name}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each PHASES as phase, pi (phase.number)}
        {@const parts = phase.description.split(' + ')}
        <tr>
          <th scope="row">
            <div class="label">
              <span class="num">{phase.number}</span>
              <span class="desc">
                {#each parts as part, i (i)}
                  <span class:keep={parts.length > 1}>{part}{i < parts.length - 1 ? ' +' : ''}</span>{' '}
                {/each}
              </span>
            </div>
          </th>
          {#each game.players as _, i (i)}
            {@const m = mark(i, pi)}
            <td class={m}>
              <span aria-hidden="true">{SYMBOL[m]}</span>
              <span class="sr">{WORDS[m]}</span>
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
    <tfoot>
      <tr>
        <th scope="row">Completed</th>
        {#each game.players as p, i (i)}
          <td class="total">{p.done.filter(Boolean).length} of {PHASES.length}</td>
        {/each}
      </tr>
    </tfoot>
  </table>
</div>
<p class="legend">
  <span><b class="done">✓</b> completed</span>
  <span><b class="laid">●</b> laid down this round</span>
  {#if game.mode !== 'yousee'}<span><b class="now">▸</b> working on it</span>{/if}
</p>

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
    padding: 0.38rem 0.25rem;
    border-bottom: 1px solid rgb(255 255 255 / 0.15);
    text-align: center;
  }
  thead th {
    font-size: 0.8rem;
    color: var(--text-dim);
    font-weight: 700;
  }
  thead th:first-child,
  tbody th,
  tfoot th {
    text-align: left;
  }
  .who {
    max-width: 5.5rem;
    overflow-wrap: break-word; /* keep a name like Karla on one line, only split very long ones */
  }
  tbody th {
    font-weight: 600;
    font-size: 0.88rem;
  }
  .label {
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
  }
  /* When a phase has two groups, a wrap falls between them, so each group's number stays with it. */
  .keep {
    white-space: nowrap;
  }
  .num {
    flex: none;
    width: 1.3rem;
    color: var(--gold);
    font-weight: 800;
  }
  tfoot th,
  .total {
    font-size: 0.82rem;
    color: var(--text-dim);
  }
  td {
    position: relative;
    font-size: 1.15rem;
    font-weight: 800;
  }
  td.done {
    color: #7ff0a6;
    background: rgb(127 240 166 / 0.1);
  }
  td.laid {
    color: var(--gold);
    background: rgb(255 216 77 / 0.1);
  }
  td.now {
    color: #6ee7f9;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1rem;
  }
  .legend b.done {
    color: #7ff0a6;
  }
  .legend b.laid {
    color: var(--gold);
  }
  .legend b.now {
    color: #6ee7f9;
  }
</style>
