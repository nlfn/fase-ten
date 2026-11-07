<script lang="ts">
  import {
    PHASES,
    PHASE_COUNT,
    targetPhase,
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
  import PhaseChart from './PhaseChart.svelte'
  import Scoreboard from './Scoreboard.svelte'
  import { groupTurns } from './turns'
  import PhasePicker from './PhasePicker.svelte'
  import type { PhaseOption } from './PhasePicker.svelte'
  import { clearSession, saveSession } from './storage'
  import type { Session } from './storage'

  interface Props {
    session: Session
    onExit: () => void // back to the menu; the game is saved and can be continued
    onQuit: () => void // abandon the game for good
  }

  let { session, onExit, onQuit }: Props = $props()

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
  let showChart = $state(false)
  let showScores = $state(false)
  let showPicker = $state(false)
  let confirmQuit = $state(false)
  let keepPlaying = $state<HTMLButtonElement>()
  $effect(() => {
    if (confirmQuit) keepPlaying?.focus()
  })
  // Lets the player tuck the round summary away to look over the finished table.
  let resultHidden = $state(false)

  const HUMAN = 0
  const yousee = $derived(game.mode === 'yousee')
  const me = $derived(game.players[HUMAN])
  // The phase you are working on in classic and random games (0 once you have finished them all).
  const myTarget = $derived(targetPhase(game, me) ?? 0)
  const cur = $derived(currentPlayer(game))
  const myTurn = $derived(game.status === 'playing' && game.current === HUMAN)
  const top = $derived(topDiscard(game))
  const canDrawDeck = $derived(myTurn && game.stage === 'draw')
  const canTakeDiscard = $derived(myTurn && canPickUpDiscard(game))
  // Lay down stays grey until the cards (the selection, if any, else the whole hand) make a phase
  // the player may lay down: the current phase, or in YouSee any phase not completed yet.
  // Whether the hand as a whole could make a phase this player may lay down. When it cannot (or the
  // player has already laid down), the only cards worth picking are single ones to hit or discard,
  // so picking a different card replaces the selection instead of adding to it.
  const handCanLay = $derived.by(() => {
    if (me.laidDown || (targetPhase(game, me) === null && !yousee)) return false
    return PHASES.some((_, i) => (yousee ? !me.done[i] : i === myTarget) && findPhaseLayout(me.hand, i, game.melds) !== null)
  })
  const canLay = $derived.by(() => {
    if (!myTurn || game.stage !== 'play' || me.laidDown) return false
    if (targetPhase(game, me) === null && !yousee) return false
    return PHASES.some((_, i) => (yousee ? !me.done[i] : i === myTarget) && layoutFor(i) !== null)
  })
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
      return yousee
        ? 'Lay down any phase you have not completed when you can, then discard one card.'
        : `Lay down Phase ${myTarget + 1} (${phaseDescription(myTarget)}) when you can, then discard one card.`
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
    const card = me.hand.find((c) => c.id === id)
    const holdingSkip = selectedCards.some((c) => c.kind === 'skip')
    if (card && !selectedIds.includes(id) && (card.kind === 'skip' || holdingSkip)) {
      // A Skip is only ever played on a player, never in a group, so it is selected on its own.
      selectedIds = [id]
      autoSelected = false
      notice = ''
      return
    }
    if (!handCanLay) {
      selectedIds = selectedIds.includes(id) ? [] : [id]
      autoSelected = false
      notice = ''
      return
    }
    if (autoSelected) {
      // The first tap after drawing starts a new selection (or clears the automatic one).
      selectedIds = selectedIds.includes(id) ? [] : [id]
      autoSelected = false
    } else {
      selectedIds = selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]
    }
    notice = ''
  }

  /** The groups a phase would be laid down as: from the selected cards if several are picked, else the best layout in hand. */
  function layoutFor(phase: number): Card[][] | null {
    return selectedCards.length > 1
      ? arrangeSelection(selectedCards, phase)
      : findPhaseLayout(me.hand, phase, game.melds)
  }

  const pickerOptions = $derived.by((): PhaseOption[] => {
    if (!showPicker) return []
    return PHASES.map((phase, index) => ({
      index,
      description: phase.description,
      status: me.done[index] ? 'done' : layoutFor(index) ? 'ready' : 'notyet',
    }))
  })

  // The best-play helper never makes mistakes, whatever the opponents' level is.
  const autoPlayer = createBot('expert')

  /**
   * Lays down the groups and, when the player did not pick the cards themselves, also adds every
   * card that fits onto the table, the same way the computer players do. One undo covers it all.
   */
  function layDownAndHit(action: Action & { type: 'layDown' }, addExtras: boolean) {
    const first = applyAction(game, action)
    if (!first.ok) {
      notice = first.error
      return
    }
    let state = first.state
    if (addExtras) {
      while (state.status === 'playing' && state.stage === 'play') {
        const next = autoPlayer.chooseAction(state)
        if (next.type !== 'hit') break
        const result = applyAction(state, next)
        if (!result.ok) break
        state = result.state
      }
    }
    undoStack = state.status === 'playing' ? [...undoStack, game] : []
    game = state
    notice = ''
    selectedIds = []
    autoSelected = false
  }

  function layDown() {
    if (selectedCards.length > 1 && selectedCards.some((c) => c.kind === 'skip')) {
      notice = "Skip cards can't go in a group. Select the Skip alone, then choose a player to play it on."
      return
    }

    if (yousee) {
      // You choose the phase, so show the ones these cards can make and let the player pick.
      const canMake = PHASES.some((_, i) => !me.done[i] && layoutFor(i) !== null)
      if (!canMake) {
        notice =
          selectedCards.length > 1
            ? 'Those cards do not make any phase you have not completed yet.'
            : 'You can not lay down any of your remaining phases yet.'
        return
      }
      notice = ''
      showPicker = true
      return
    }

    let groups: Card[][] | null
    // One selected card can never be a whole phase, so a single card means "find it for me".
    if (selectedCards.length > 1) {
      groups = arrangeSelection(selectedCards, myTarget)
      if (!groups) {
        notice = `Those cards do not make Phase ${myTarget + 1} (${phaseDescription(myTarget)}).`
        return
      }
    } else {
      groups = findPhaseLayout(me.hand, myTarget, game.melds)
      if (!groups) {
        notice = `You can't lay down yet. Phase ${myTarget + 1} needs ${phaseDescription(myTarget)}.`
        return
      }
    }
    layDownAndHit({ type: 'layDown', groups: groups.map((g) => g.map((c) => c.id)) }, selectedCards.length <= 1)
  }

  function pickPhase(phase: number) {
    const groups = layoutFor(phase)
    showPicker = false
    if (!groups) return
    layDownAndHit({ type: 'layDown', groups: groups.map((g) => g.map((c) => c.id)), phase }, selectedCards.length <= 1)
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
    resultHidden = false
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

  // One row per turn, newest first. Older turns scroll.
  const allTurns = $derived(groupTurns(game.events).reverse())
  // Show only one player's turns when a name chip is picked (null means everyone).
  let historyFilter = $state<number | null>(null)
  const history = $derived(
    historyFilter === null ? allTurns.slice(0, 14) : allTurns.filter((t) => t.player === historyFilter).slice(0, 12),
  )

  const ownerLabel = (owner: number, player: number): string =>
    owner === player ? 'their own group' : `${game.players[owner].name}'s group`

  function phaseLabel(phase: number): string {
    return phase >= PHASE_COUNT ? 'All phases done' : `Phase ${phase + 1}`
  }

  /** The short progress line shown in a player's panel. */
  function progress(p: GameState['players'][number]): string {
    if (yousee) return `${p.phase} of ${PHASE_COUNT} done`
    const label = phaseLabel(targetPhase(game, p) ?? PHASE_COUNT)
    // Once a round is over, a player who finished their phase has already moved on to the next one.
    return game.status === 'roundOver' ? `Next: ${label}` : label
  }

  /** What a player is after right now, shown under their stats. */
  function goalLine(p: GameState['players'][number]): string {
    if (p.laidDown && p.laidPhase !== null) {
      return `Laid down Phase ${p.laidPhase + 1}: ${phaseDescription(p.laidPhase)}`
    }
    if (yousee) return ''
    const target = targetPhase(game, p)
    return target === null ? '' : phaseDescription(target)
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

<div class="table" class:has-bar={resultHidden && game.status !== 'playing'}>
  <header class="bar">
    <h1>Round {game.round}</h1>
    {#if me.laidDown && me.laidPhase !== null}
      <p class="goal"><strong>Phase {me.laidPhase + 1}</strong> {phaseDescription(me.laidPhase)}</p>
    {:else if yousee}
      <p class="goal"><strong>Your choice</strong> {me.phase} of {PHASE_COUNT} phases done</p>
    {:else}
      <p class="goal"><strong>Phase {myTarget + 1}</strong> {phaseDescription(myTarget)}</p>
    {/if}
    <button type="button" class="ghost" onclick={() => (showScores = true)}>Scores</button>
    <button type="button" class="ghost" onclick={() => (showChart = true)}>Phases</button>
    <button type="button" class="ghost" onclick={onExit}>Menu</button>
    <button type="button" class="ghost" onclick={() => (confirmQuit = true)}>Quit</button>
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
          {#if p.skipsPending > 0}
            <span class="badge warn">{p.skipsPending > 1 ? `Loses ${p.skipsPending} turns` : 'Loses a turn'}</span>
          {/if}
        </div>
        <div class="pstats">
          <span>{progress(p)}</span>
          <span>{p.hand.length} cards</span>
          <span>{p.score} points</span>
        </div>
        {#if goalLine(p)}
          <p class="pgoal">{goalLine(p)}</p>
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
    </div>
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
  </section>

  <section class="hand-area" aria-label="Your hand">
    <div class="actions">
      {#if !me.laidDown}
        <button type="button" class="primary" disabled={!canLay} onclick={layDown}>
          {selectedCards.length > 1 ? 'Lay down selected' : yousee ? 'Lay down a phase' : 'Lay down phase'}
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

  {#if showPicker && myTurn}
    <PhasePicker
      options={pickerOptions}
      usingSelection={selectedCards.length > 1}
      onPick={pickPhase}
      onClose={() => (showPicker = false)}
    />
  {/if}

  {#if confirmQuit}
    <div class="modal-backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && (confirmQuit = false)}>
      <div
        class="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="quit-title"
        aria-describedby="quit-text"
        tabindex="-1"
        onkeydown={(e) => e.key === 'Escape' && (confirmQuit = false)}
      >
        <h2 id="quit-title">Quit this game?</h2>
        <p id="quit-text">
          This will abandon the current game. Your scores and progress will be lost and you will not be able to
          continue it. To pause instead, use Menu.
        </p>
        <div class="quit-actions">
          <button type="button" class="primary" bind:this={keepPlaying} onclick={() => (confirmQuit = false)}>
            Keep playing
          </button>
          <button type="button" class="danger" onclick={onQuit}>Abandon game</button>
        </div>
      </div>
    </div>
  {/if}

  {#if showChart}
    <PhaseChart {game} onClose={() => (showChart = false)} />
  {/if}

  {#if showScores}
    <Scoreboard {game} onClose={() => (showScores = false)} />
  {/if}

  {#if game.status !== 'playing' && resultHidden}
    <div class="result-bar" role="status">
      <strong>{resultTitle}</strong>
      <button type="button" class="ghost" onclick={() => (resultHidden = false)}>Show results</button>
      {#if game.status === 'gameOver'}
        <button type="button" class="primary" onclick={onExit}>New game</button>
      {:else}
        <button type="button" class="primary" onclick={startNextRound}>Next round</button>
      {/if}
    </div>
  {:else if game.status !== 'playing'}
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
                    {p.phase >= PHASE_COUNT ? 'Finished' : progress(p)}
                  {:else if yousee}
                    {progress(p)}
                  {:else}
                    {phaseLabel(targetPhase(game, p) ?? PHASE_COUNT)}{game.roundResult?.completed[i] ? '' : ' (repeat)'}
                  {/if}
                  {#if game.roundResult?.completed[i] && p.laidPhase !== null}
                    <span class="sub">Completed Phase {p.laidPhase + 1}</span>
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
        <div class="result-actions">
          <button type="button" class="ghost big" onclick={() => (resultHidden = true)}>View table</button>
          {#if game.status === 'gameOver'}
            <button type="button" class="primary big" bind:this={continueButton} onclick={onExit}>New game</button>
          {:else}
            <button type="button" class="primary big" bind:this={continueButton} onclick={startNextRound}>Next round</button>
          {/if}
        </div>
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
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.4rem;
  }
  .bar button {
    padding: 0.4rem 0.6rem;
    font-size: 0.85rem;
  }
  @media (max-width: 560px) {
    /* On a phone the goal gets its own row under the title and buttons. */
    .bar h1 {
      margin-right: auto;
    }
    .goal {
      order: 3;
      flex: 1 1 100%;
    }
  }
  .bar h1 {
    flex: none;
    margin: 0;
    font-size: 1rem;
    font-weight: 800;
  }
  .goal {
    margin: 0;
    flex: 1 1 12rem;
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
  .quit-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.6rem;
  }
  .result-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.6rem;
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
  .table.has-bar {
    padding-bottom: 5rem;
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
  .sub {
    display: block;
    font-size: 0.75rem;
    color: var(--gold);
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
