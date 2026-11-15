<script lang="ts">
  // One panel per player: name, badges, progress, cards in hand and score. When a Skip is being
  // played, the players it can go on light up with a button.
  import { isSittingOut } from '../../engine'
  import type { GameState } from '../../engine'
  import { goalLine, progressLine } from '../gameText'

  interface Props {
    game: GameState
    /** A Skip is selected and waiting for a player to be chosen. */
    canPlaySkip: boolean
    /** For each seat, whether the Skip may be played on it. */
    skipTargets: boolean[]
    onSkip: (target: number) => void
  }
  let { game, canPlaySkip, skipTargets, onSkip }: Props = $props()
</script>

<section class="players" aria-label="Players">
  {#each game.players as p, i (i)}
    <div
      class="player"
      class:turn={game.status === 'playing' && game.current === i}
      class:target={canPlaySkip && skipTargets[i]}
    >
      <div class="phead">
        <span class="pname">{p.name}</span>
        {#if isSittingOut(game, i)}<span class="badge">Sitting out</span>{/if}
        {#if p.laid !== null}<span class="badge ok">Laid down</span>{/if}
        {#if p.skipsPending > 0}
          <span class="badge warn">Loses a turn</span>
        {/if}
      </div>
      <div class="pstats">
        <span>{progressLine(game, i)}</span>
        <span>{p.hand.length} cards</span>
        <span>{p.score} points</span>
      </div>
      {#if goalLine(game, i) && !isSittingOut(game, i)}
        <p class="pgoal">{goalLine(game, i)}</p>
      {/if}
      {#if canPlaySkip && skipTargets[i]}
        <button type="button" class="chip" onclick={() => onSkip(i)}>Play on {p.name}</button>
      {/if}
    </div>
  {/each}
</section>

<style>
  .players {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(8.4rem, 1fr));
    gap: 0.5rem;
  }
  .player {
    padding: 0.5rem 0.65rem;
    border-radius: 0.7rem;
    background: var(--felt-deep);
    box-shadow: 0 0 0 2px transparent;
    transition: box-shadow 160ms;
  }
  .player.turn {
    box-shadow: 0 0 0 2px var(--gold);
  }
  .player.target {
    background: rgb(255 216 77 / 0.18);
    box-shadow: 0 0 0 2px var(--gold);
  }
  .player .chip {
    margin-top: 0.4rem;
  }
  .pgoal {
    margin: 0.25rem 0 0;
    font-size: 0.8rem;
    color: var(--gold);
  }
  .phead {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.15rem 0.5rem;
  }
  .pname {
    font-weight: 800;
  }
  .pstats {
    display: flex;
    flex-wrap: wrap;
    gap: 0.1rem 0.7rem;
    font-size: 0.82rem;
    color: var(--text-dim);
  }
  .badge {
    padding: 0.05rem 0.5rem;
    border-radius: 99px;
    font-size: 0.75rem;
    font-weight: 700;
  }
  .badge:not(.ok):not(.warn) {
    background: rgb(255 255 255 / 0.18);
    color: var(--text);
  }
  .badge.ok {
    background: #2a9a5a;
    color: #fff;
  }
  .badge.warn {
    background: #ff6b5e;
    color: #20120f;
  }
  .chip {
    padding: 0.35rem 0.7rem;
    font-size: 0.85rem;
    border-radius: 99px;
    background: var(--gold);
    color: var(--ink);
  }
</style>
