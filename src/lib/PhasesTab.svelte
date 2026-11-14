<script lang="ts">
  import { doneCount, isSingleRound, phasesOf, targetPhase } from '../engine'
  import type { GameState } from '../engine'

  interface Props {
    game: GameState
  }

  let { game }: Props = $props()
  const phases = $derived(phasesOf(game.phaseSet ?? 'classic'))

  type Mark = 'done' | 'laid' | 'now' | 'open'

  // done: completed in an earlier round. laid: laid down this round (counts once the round ends).
  // now: the phase a classic player is working on. open: not yet.
  function mark(playerIndex: number, phaseIndex: number): Mark {
    const p = game.players[playerIndex]
    if (p.done[phaseIndex]) return 'done'
    if (p.laid === phaseIndex) return 'laid'
    if (targetPhase(game, playerIndex) === phaseIndex) return 'now'
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

{#if isSingleRound(game)}
  <p>
    Single round: {phases[0].description}. Whoever goes out first scores zero and wins. Use Quit to stop at any time.
  </p>
{:else}
<p>
  {game.mode === 'yousee'
    ? 'Each player can complete the phases in any order, once each.'
    : game.mode === 'random'
      ? 'Each player has their own secret order. You can only see the phase each player is on.'
      : game.mode === 'reverse'
        ? 'Backwards: players work backwards, from Phase 10 down to Phase 1.'
        : 'Players work through the phases in order.'}
</p>
<div>
  {#snippet text(part: string)}{#each part.split(/(rainbow)/) as chunk, c (c)}{#if chunk === 'rainbow'}{#each chunk.split('') as ch, k (k)}<span class={'rb' + (k % 4)}>{ch}</span>{/each}{:else}{chunk}{/if}{/each}{/snippet}
<table>
    <thead>
      <tr>
        <th scope="col">Phase</th>
        {#each game.players as p, i (i)}
          <th scope="col" class="who" title={p.name}>{p.name}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each phases as phase, pi (phase.number)}
        {@const parts = phase.description.split(' + ')}
        <tr>
          <th scope="row">
            <div class="label">
              <span class="num">{phase.number}</span>
              <span class="desc">
                {#each parts as part, i (i)}
                  <span class:keep={parts.length > 1}>{@render text(part)}{i < parts.length - 1 ? ' +' : ''}</span>{' '}
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
          <td class="total">{doneCount(p)} of {phases.length}</td>
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
{#if game.phaseSet === 'alternate'}
  <p class="legend"><span>Rainbow run: the same number of each color. Color run: all one color. No Wilds: a Wild cannot help lay it down.</span></p>
{/if}
{/if}

<style>
  .rb0 { color: #ff6b5e; }
  .rb1 { color: #ffd84d; }
  .rb2 { color: #7ff0a6; }
  .rb3 { color: #6ea8ff; }
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
  /* The player names stay at the top of the sheet while the rows scroll under them. The line under
     them is a shadow because a collapsed table border does not travel with a sticky cell. */
  thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--felt);
    box-shadow: inset 0 -1px 0 rgb(255 255 255 / 0.15);
    border-bottom: 0;
    font-size: 0.76rem;
    color: var(--text-dim);
    font-weight: 700;
  }
  thead th:first-child,
  tbody th,
  tfoot th {
    text-align: left;
  }
  .who {
    max-width: 3.6rem;
    overflow: hidden;
    text-overflow: ellipsis; /* a long name is cut with ... so four players always fit on a phone */
    white-space: nowrap;
  }
  tbody th {
    font-weight: 600;
    font-size: 0.84rem;
  }
  .label {
    display: flex;
    gap: 0.4rem;
    align-items: baseline;
  }
  /* When a phase has two groups, a wrap falls between them, so each group's number stays with it. */
  .keep {
    white-space: nowrap;
  }
  /* On a narrow phone with four players there is no room to keep a whole group on one line. */
  @media (max-width: 399px) {
    .keep {
      white-space: normal;
    }
  }
  @media (max-width: 440px) {
    th,
    td {
      padding-inline: 0.15rem;
    }
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
