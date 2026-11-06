<script lang="ts">
  import {
    PHASE_COUNT,
    applyAction,
    arrangeSelection,
    canPickUpDiscard,
    cardPoints,
    createBot,
    currentPlayer,
    findPhaseLayout,
    hitTargets,
    meldsOf,
    nextRound,
    phaseDescription,
    recentHitIds,
    topDiscard,
  } from '../engine'
  import type { Action, Card, GameState, HitTarget, Meld, RunEnd } from '../engine'
  import CardView from './CardView.svelte'
  import { clearSession, saveSession } from './storage'
  import type { Session } from './storage'

  interface Props {
    session: Session
    onExit: () => void
  }

  let { session, onExit }: Props = $props()

  // The game state is replaced as a whole after every action, so it stays unproxied.
  // svelte-ignore state_referenced_locally
  let game = $state.raw<GameState>(session.state)
  // svelte-ignore state_referenced_locally
  const bot = createBot(session.level)

  let selectedIds = $state<number[]>([])
  let sortMode = $state<'number' | 'color'>('number')
  let notice = $state('')
  // True while the only selection is the card that was selected automatically after a draw.
  // The first tap on a card then starts a fresh selection instead of adding to it.
  let autoSelected = $state(false)
  let continueButton = $state<HTMLButtonElement>()
  // States from before each lay down or hit this turn, so those moves can be taken back.
  // Drawing and discarding clear it: they cannot be undone.
  let undoStack = $state.raw<GameState[]>([])

  const HUMAN = 0
  const me = $derived(game.players[HUMAN])
  const cur = $derived(currentPlayer(game))
  const myTurn = $derived(game.status === 'playing' && game.current === HUMAN)
  const top = $derived(topDiscard(game))
  const canDrawDeck = $derived(myTurn && game.stage === 'draw')
  const canTakeDiscard = $derived(myTurn && canPickUpDiscard(game))
  const canLay = $derived(myTurn && game.stage === 'play' && !me.laidDown)
  const sortedHand = $derived(sortHand(me.hand, sortMode))
  // Cards added to a group during the last full lap of the table, shown with an outline.
  const markedIds = $derived(recentHitIds(game))
  const anyMarked = $derived(game.melds.some((m) => m.cards.some((c) => markedIds.has(c.id))))
  const selectedCards = $derived(me.hand.filter((c) => selectedIds.includes(c.id)))
  const skipSelected = $derived(selectedCards.length === 1 && selectedCards[0].kind === 'skip')
  // A Skip is never just thrown away: it has to be played on someone, like adding to a group.
  const canPlaySkip = $derived(myTurn && game.stage === 'play' && skipSelected)
  const canDiscard = $derived(
    myTurn && game.stage === 'play' && selectedCards.length === 1 && !skipSelected,
  )

  const hitMap = $derived.by(() => {
    const map = new Map<number, HitTarget>()
    if (!myTurn || game.stage !== 'play' || !me.laidDown || selectedCards.length !== 1) return map
    for (const target of hitTargets(game, selectedCards[0])) map.set(target.meldId, target)
    return map
  })

  const status = $derived.by(() => {
    if (game.status !== 'playing') return ''
    if (!myTurn) return `${cur.name} is playing`
    if (game.stage === 'draw') return 'Your turn. Draw from the deck or take the top discard.'
    if (canPlaySkip) return 'Choose who loses a turn.'
    if (!me.laidDown) {
      return `Lay down Phase ${me.phase + 1} (${phaseDescription(me.phase)}) when you can, then discard one card.`
    }
    return 'Pick a card to add to a group on the table, or discard one card to end your turn.'
  })

  const resultTitle = $derived.by(() => {
    if (game.status === 'gameOver') {
      const names = game.winners.map((i) => game.players[i].name)
      if (game.winners.length === 1) {
        return game.winners[0] === HUMAN ? 'You win the game' : `${names[0]} wins the game`
      }
      return `${names.join(' and ')} tie for the win`
    }
    const winner = game.roundResult?.winner
    if (winner === null || winner === undefined) return 'Round over'
    return winner === HUMAN ? 'You went out' : `${game.players[winner].name} went out`
  })

  // Computer players take their turns one action at a time so you can follow along.
  $effect(() => {
    if (game.status !== 'playing' || !game.players[game.current].isBot) return
    const timer = setTimeout(
      () => {
        const result = applyAction(game, bot.chooseAction(game))
        if (result.ok) game = result.state
        else notice = result.error
      },
      game.stage === 'draw' ? 900 : 700,
    )
    return () => clearTimeout(timer)
  })

  $effect(() => {
    if (game.status === 'gameOver') clearSession()
    else saveSession({ state: game, level: session.level })
  })

  $effect(() => {
    if (game.status !== 'playing') continueButton?.focus()
  })

  function sortHand(hand: Card[], mode: 'number' | 'color'): Card[] {
    const colorRank = { red: 0, blue: 1, green: 2, yellow: 3 }
    const key = (c: Card): number => {
      if (c.kind === 'wild') return 10_000
      if (c.kind === 'skip') return 10_001
      return mode === 'number' ? c.value * 10 + colorRank[c.color] : colorRank[c.color] * 100 + c.value
    }
    return hand.slice().sort((a, b) => key(a) - key(b) || a.id - b.id)
  }

  function dispatch(action: Action): boolean {
    const result = applyAction(game, action)
    if (!result.ok) {
      notice = result.error
      return false
    }
    // After a draw, the new card is selected for you so you can discard or hit with it right away.
    let next: number[] = []
    if (action.type === 'drawDeck' || action.type === 'drawDiscard') {
      const before = new Set(me.hand.map((c) => c.id))
      const drawn = result.state.players[HUMAN].hand.find((c) => !before.has(c.id))
      if (drawn) next = [drawn.id]
    }
    autoSelected = next.length > 0
    if ((action.type === 'layDown' || action.type === 'hit') && result.state.status === 'playing') {
      undoStack = [...undoStack, game]
    } else {
      undoStack = []
    }
    game = result.state
    notice = ''
    selectedIds = next
    return true
  }

  function toggle(id: number) {
    if (autoSelected) {
      // The first tap after drawing starts a new selection (or clears the automatic one).
      selectedIds = selectedIds.includes(id) ? [] : [id]
      autoSelected = false
    } else {
      selectedIds = selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]
    }
    notice = ''
  }

  function layDown() {
    let groups: Card[][] | null
    // One selected card can never be a whole phase, so a single card means "find it for me".
    if (selectedCards.length > 1) {
      if (selectedCards.some((c) => c.kind === 'skip')) {
        notice = "Skip cards can't go in a group. Select the Skip alone, then choose a player to play it on."
        return
      }
      groups = arrangeSelection(selectedCards, me.phase)
      if (!groups) {
        notice = `Those cards do not make Phase ${me.phase + 1} (${phaseDescription(me.phase)}).`
        return
      }
    } else {
      groups = findPhaseLayout(me.hand, me.phase, game.melds)
      if (!groups) {
        notice = `You can't lay down yet. Phase ${me.phase + 1} needs ${phaseDescription(me.phase)}.`
        return
      }
    }
    dispatch({ type: 'layDown', groups: groups.map((g) => g.map((c) => c.id)) })
  }

  function undo() {
    const previous = undoStack[undoStack.length - 1]
    if (!previous || !myTurn) return
    undoStack = undoStack.slice(0, -1)
    game = previous
    selectedIds = []
    autoSelected = false
    notice = ''
  }

  function hit(meldId: number, end?: RunEnd) {
    if (selectedCards.length !== 1) return
    dispatch({ type: 'hit', cardId: selectedCards[0].id, meldId, end })
  }

  function discardSelected() {
    if (!canDiscard) return
    dispatch({ type: 'discard', cardId: selectedCards[0].id })
  }

  function playSkipOn(target: number) {
    if (!canPlaySkip) return
    dispatch({ type: 'discard', cardId: selectedCards[0].id, skipTarget: target })
  }

  function startNextRound() {
    game = nextRound(game)
    undoStack = []
    selectedIds = []
    autoSelected = false
    notice = ''
  }

  function meldTitle(m: Meld): string {
    switch (m.kind) {
      case 'set':
        return `Set of ${m.value}s`
      case 'run':
        return `Run ${m.start} to ${m.end}`
      case 'color':
        return `${m.color[0].toUpperCase()}${m.color.slice(1)} cards`
    }
  }

  function phaseLabel(phase: number): string {
    return phase >= PHASE_COUNT ? 'All phases done' : `Phase ${phase + 1}`
  }
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
            <button type="button" class="chip" onclick={() => hit(m.id, end)}>
              Add as {end === 'low' ? m.start - 1 : m.end + 1}
            </button>
          {/each}
        {:else}
          <button type="button" class="chip" onclick={() => hit(m.id)}>Add here</button>
        {/if}
      </div>
    {/if}
  </div>
{/snippet}

<div class="table">
  <header class="bar">
    <h1>Round {game.round}</h1>
    <p class="goal"><strong>Phase {Math.min(me.phase + 1, PHASE_COUNT)}</strong> {phaseDescription(me.phase)}</p>
    <button type="button" class="ghost" onclick={onExit}>Menu</button>
  </header>

  <section class="players" aria-label="Players">
    {#each game.players as p, i (i)}
      <div
        class="player"
        class:turn={game.status === 'playing' && game.current === i}
        class:target={canPlaySkip && i !== HUMAN}
      >
        <div class="phead">
          <span class="pname">{p.name}</span>
          {#if p.laidDown}<span class="badge ok">Laid down</span>{/if}
          {#if p.skipped}<span class="badge warn">Loses a turn</span>{/if}
        </div>
        <div class="pstats">
          <span>{phaseLabel(p.phase)}</span>
          <span>{p.hand.length} cards</span>
          <span>{p.score} points</span>
        </div>
        {#if p.phase < PHASE_COUNT}
          <p class="pgoal">{phaseDescription(p.phase)}</p>
        {/if}
        {#if canPlaySkip && i !== HUMAN}
          <button type="button" class="chip" onclick={() => playSkipOn(i)}>Play on {p.name}</button>
        {/if}
      </div>
    {/each}
  </section>

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

  <section class="center" aria-label="Draw and discard piles">
    <div class="piles">
      <div class="pile-wrap">
        <button
          type="button"
          class="deck"
          disabled={!canDrawDeck}
          onclick={() => dispatch({ type: 'drawDeck' })}
          aria-label="Draw from the deck, {game.drawPile.length} cards left"
        >
          <span class="count">{game.drawPile.length}</span>
        </button>
        <span class="pile-label">Deck</span>
      </div>
      <div class="pile-wrap">
        {#if top}
          <CardView
            card={top}
            glow={canTakeDiscard}
            onclick={canTakeDiscard ? () => dispatch({ type: 'drawDiscard' }) : undefined}
          />
        {:else}
          <div class="slot">Empty</div>
        {/if}
        <span class="pile-label">Discard</span>
      </div>
    </div>
    <div class="talk" aria-live="polite">
      <p class="status">{status}</p>
      {#if notice}<p class="notice" role="alert">{notice}</p>{/if}
      <p class="log">{game.log.slice(-3).join('. ')}</p>
    </div>
  </section>

  <section class="hand-area" aria-label="Your hand">
    <div class="actions">
      {#if !me.laidDown}
        <button type="button" class="primary" disabled={!canLay} onclick={layDown}>
          {selectedCards.length > 1 ? 'Lay down selected' : 'Lay down phase'}
        </button>
      {/if}
      <button type="button" disabled={!canDiscard} onclick={discardSelected}>Discard</button>
      {#if myTurn && undoStack.length > 0}
        <button type="button" onclick={undo}>Undo last move</button>
      {/if}
      <button type="button" class="ghost" onclick={() => (sortMode = sortMode === 'number' ? 'color' : 'number')}>
        Sort by {sortMode === 'number' ? 'color' : 'number'}
      </button>
    </div>
    <div class="hand">
      {#each sortedHand as c (c.id)}
        <CardView card={c} selected={selectedIds.includes(c.id)} onclick={() => toggle(c.id)} />
      {/each}
    </div>
  </section>

  {#if game.status !== 'playing'}
    <div class="overlay">
      <div class="panel" role="dialog" aria-modal="true" aria-labelledby="result-title">
        <h2 id="result-title">{resultTitle}</h2>
        <table>
          <thead>
            <tr><th scope="col">Player</th><th scope="col">This round</th><th scope="col">Total</th><th scope="col">Next</th></tr>
          </thead>
          <tbody>
            {#each game.players as p, i (i)}
              <tr>
                <th scope="row">{p.name}</th>
                <td>{game.roundResult?.points[i] ?? 0}</td>
                <td>{p.score}</td>
                <td>
                  {#if game.status === 'gameOver'}
                    {p.phase >= PHASE_COUNT ? 'Finished' : phaseLabel(p.phase)}
                  {:else}
                    {phaseLabel(p.phase)}{game.roundResult?.completed[i] ? '' : ' (repeat)'}
                  {/if}
                </td>
              </tr>
              <tr class="cards-row">
                <td colspan="4">
                  {#if p.hand.length === 0}
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
        {#if game.status === 'gameOver'}
          <button type="button" class="primary big" bind:this={continueButton} onclick={onExit}>New game</button>
        {:else}
          <button type="button" class="primary big" bind:this={continueButton} onclick={startNextRound}>Next round</button>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .table {
    min-height: 100dvh;
    max-width: 64rem;
    margin: 0 auto;
    display: grid;
    grid-template-rows: auto auto minmax(5rem, 1fr) auto auto;
    gap: 0.75rem;
    padding: max(0.75rem, env(safe-area-inset-top)) 0.9rem max(0.9rem, env(safe-area-inset-bottom));
  }

  .bar {
    display: flex;
    align-items: baseline;
    gap: 1rem;
  }
  .bar h1 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 800;
  }
  .goal {
    margin: 0;
    flex: 1;
    color: var(--text-dim);
    font-size: 0.95rem;
  }
  .goal strong {
    color: var(--gold);
  }

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
  .badge.ok {
    background: #2a9a5a;
    color: #fff;
  }
  .badge.warn {
    background: #ff6b5e;
    color: #20120f;
  }

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

  .center {
    display: flex;
    align-items: center;
    gap: 1.25rem;
    flex-wrap: wrap;
  }
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
  .talk {
    flex: 1;
    min-width: 12rem;
    display: grid;
    gap: 0.3rem;
  }
  .talk p {
    margin: 0;
  }
  .status {
    font-weight: 700;
    font-size: 0.98rem;
    max-width: 38ch;
  }
  .notice {
    color: #ffb3aa;
    font-weight: 600;
  }
  .log {
    color: var(--text-dim);
    font-size: 0.85rem;
  }

  .hand-area {
    display: grid;
    gap: 0.6rem;
    padding-top: 0.3rem;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .actions button {
    padding: 0.7rem 0.75rem;
    font-size: 0.92rem;
  }
  .hand {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    padding: 0.5rem 0.2rem 0.3rem;
    min-height: 6rem;
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
  .big {
    padding: 0.9rem;
    font-size: 1.1rem;
  }

  @media (min-width: 720px) {
    .table {
      padding-inline: 1.5rem;
      gap: 1rem;
    }
    .hand {
      flex-wrap: nowrap;
      justify-content: center;
    }
  }
</style>
