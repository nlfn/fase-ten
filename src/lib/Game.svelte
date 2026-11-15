<script lang="ts">
  // The game screen. This file holds the turn: the game state, what is selected, what the player may
  // do, and what each button does. The parts of the screen are in ./game/, and the words in gameText.ts.
  import {
    targetPhase,
    doneCount,
    isSingleRound,
    openPhases,
    applyAction,
    arrangeSelection,
    canPickUpDiscard,
    createBot,
    currentPlayer,
    discardLastCard,
    findPhaseLayout,
    hitTargets,
    isSittingOut,
    nextRound,
    phaseDescription,
    phasesOf,
    topDiscard,
  } from '../engine'
  import type { Action, Card, GameState, HitTarget, RunEnd } from '../engine'
  import Sheet from './Sheet.svelte'
  import type { SheetTab } from './Sheet.svelte'
  import { HUMAN } from './gameText'
  import HandArea from './game/HandArea.svelte'
  import History from './game/History.svelte'
  import Piles from './game/Piles.svelte'
  import PlayerPanels from './game/PlayerPanels.svelte'
  import QuitDialog from './game/QuitDialog.svelte'
  import RoundResult from './game/RoundResult.svelte'
  import TableGroups from './game/TableGroups.svelte'
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
  let notice = $state('')
  // True while the only selection is the card that was selected automatically after a draw.
  // The first tap on a card then starts a fresh selection instead of adding to it.
  let autoSelected = $state(false)
  // States from before each lay down or hit this turn, so those moves can be taken back.
  // Drawing and discarding clear it: they cannot be undone.
  let undoStack = $state.raw<GameState[]>([])
  // The Scores and Phases tables share one sheet; this is the tab it is open on, or null if closed.
  let sheet = $state<SheetTab | null>(null)
  let showPicker = $state(false)
  let confirmQuit = $state(false)
  // Lets the player tuck the round summary away to look over the finished table.
  let resultHidden = $state(false)

  const yousee = $derived(game.mode === 'yousee')
  const single = $derived(isSingleRound(game))
  const me = $derived(game.players[HUMAN])
  // The phase you are working on in classic and random games (0 once you have finished them all).
  const myTarget = $derived(targetPhase(game, HUMAN) ?? 0)
  // The phases you may lay down this round: your current one, in YouSee any you have not done, in a tiebreaker the one you repeat.
  const myOpen = $derived(openPhases(game, HUMAN))
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
    if (me.laid !== null) return false
    return myOpen.some((i) => findPhaseLayout(me.hand, i, game.melds, game.phaseSet) !== null)
  })
  const canLay = $derived.by(() => {
    if (!myTurn || game.stage !== 'play' || me.laid !== null) return false
    return myOpen.some((i) => layoutFor(i) !== null)
  })
  const selectedCards = $derived(me.hand.filter((c) => selectedIds.includes(c.id)))
  const skipSelected = $derived(selectedCards.length === 1 && selectedCards[0].kind === 'skip')
  // A Skip has to be played on someone, like adding to a group, and a player who is already losing a
  // turn cannot be skipped again. In normal play the player who moved just before you is always open;
  // if a damaged saved game ever leaves nobody, the Skip can simply be discarded so the game is not stuck.
  const skipTargets = $derived(
    game.players.map((p, i) => i !== HUMAN && p.skipsPending === 0 && !isSittingOut(game, i)),
  )
  const phases = $derived(phasesOf(game.phaseSet))
  const noSkipTarget = $derived(!skipTargets.some(Boolean))
  const canPlaySkip = $derived(myTurn && game.stage === 'play' && skipSelected && !noSkipTarget)
  const canDiscard = $derived(
    myTurn && game.stage === 'play' && selectedCards.length === 1 && (!skipSelected || noSkipTarget),
  )

  const hitMap = $derived.by(() => {
    const map = new Map<number, HitTarget>()
    if (!myTurn || game.stage !== 'play' || me.laid === null || selectedCards.length !== 1) return map
    for (const target of hitTargets(game, selectedCards[0])) map.set(target.meldId, target)
    return map
  })

  const status = $derived.by(() => {
    if (game.status !== 'playing') return ''
    if (!myTurn) return `${cur.name} is playing`
    if (game.stage === 'draw') return 'Your turn. Draw from the deck or take the top discard.'
    if (canPlaySkip) return 'Choose who loses a turn.'
    if (me.laid === null) {
      return yousee
        ? 'Lay down any phase you have not completed when you can, then discard one card.'
        : `Lay down Phase ${myTarget + 1} (${phaseDescription(myTarget, game.phaseSet)}) when you can, then discard one card.`
    }
    return 'Pick a card to add to a group on the table, or discard one card to end your turn.'
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

  function dispatch(action: Action): boolean {
    const first = applyAction(game, action)
    if (!first.ok) {
      notice = first.error
      return false
    }
    const result = { ...first, state: action.type === 'hit' ? discardLastCard(first.state, HUMAN) : first.state }
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
      ? arrangeSelection(selectedCards, phase, game.phaseSet)
      : findPhaseLayout(me.hand, phase, game.melds, game.phaseSet)
  }

  const pickerOptions = $derived.by((): PhaseOption[] => {
    if (!showPicker) return []
    return phases.map((phase, index) => ({
      index,
      description: phase.description,
      status: !myOpen.includes(index) ? 'done' : layoutFor(index) ? 'ready' : 'notyet',
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
    state = discardLastCard(state, HUMAN)
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
      const canMake = myOpen.some((i) => layoutFor(i) !== null)
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
      groups = arrangeSelection(selectedCards, myTarget, game.phaseSet)
      if (!groups) {
        notice = `Those cards do not make Phase ${myTarget + 1} (${phaseDescription(myTarget, game.phaseSet)}).`
        return
      }
    } else {
      groups = findPhaseLayout(me.hand, myTarget, game.melds, game.phaseSet)
      if (!groups) {
        notice = `You can't lay down yet. Phase ${myTarget + 1} needs ${phaseDescription(myTarget, game.phaseSet)}.`
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
</script>

<div class="table" class:has-bar={resultHidden && game.status !== 'playing'}>
  <header class="bar">
    <h1>{game.tiebreak ? 'Tiebreaker' : single ? 'Single round' : `Round ${game.round}`}</h1>
    {#if single}
      <p class="goal">{phaseDescription(myTarget, game.phaseSet)}</p>
    {:else if me.laid !== null}
      <p class="goal"><strong>Phase {me.laid + 1}</strong> {phaseDescription(me.laid, game.phaseSet)}</p>
    {:else if yousee}
      <p class="goal"><strong>Your choice</strong> {doneCount(me)} of {phases.length} phases done</p>
    {:else}
      <p class="goal"><strong>Phase {myTarget + 1}</strong> {phaseDescription(myTarget, game.phaseSet)}</p>
    {/if}
    <button type="button" class="ghost" onclick={() => (sheet = 'scores')}>Scores</button>
    <button type="button" class="ghost" onclick={() => (sheet = 'phases')}>Phases</button>
    <button type="button" class="ghost" onclick={onExit}>Menu</button>
    <button type="button" class="ghost" onclick={() => (confirmQuit = true)}>Quit</button>
  </header>

  <PlayerPanels {game} {canPlaySkip} {skipTargets} onSkip={playSkipOn} />

  <TableGroups {game} {hitMap} onHit={hit} />

  <section class="center" aria-label="Draw and discard piles">
    <Piles
      drawCount={game.drawPile.length}
      {top}
      {canDrawDeck}
      {canTakeDiscard}
      onDrawDeck={() => dispatch({ type: 'drawDeck' })}
      onTakeDiscard={() => dispatch({ type: 'drawDiscard' })}
    />
    <div class="talk" aria-live="polite">
      <p class="status">{status}</p>
      {#if notice}<p class="notice" role="alert">{notice}</p>{/if}
    </div>
    <History {game} />
  </section>

  <HandArea
    hand={me.hand}
    {selectedIds}
    laidDown={me.laid !== null}
    {yousee}
    {canLay}
    {canDiscard}
    canUndo={myTurn && undoStack.length > 0}
    onLayDown={layDown}
    onDiscard={discardSelected}
    onUndo={undo}
    onToggle={toggle}
  />

  {#if showPicker && myTurn}
    <PhasePicker
      options={pickerOptions}
      usingSelection={selectedCards.length > 1}
      onPick={pickPhase}
      onClose={() => (showPicker = false)}
    />
  {/if}

  {#if confirmQuit}
    <QuitDialog onCancel={() => (confirmQuit = false)} {onQuit} />
  {/if}

  {#if sheet}
    <Sheet {game} start={sheet} onClose={() => (sheet = null)} />
  {/if}

  {#if game.status !== 'playing'}
    <RoundResult {game} bind:hidden={resultHidden} onNext={startNextRound} {onExit} onSheet={(tab) => (sheet = tab)} />
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

  .center {
    display: flex;
    align-items: center;
    gap: 1.25rem;
    flex-wrap: wrap;
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
  .table.has-bar {
    padding-bottom: 5rem;
  }

  @media (min-width: 720px) {
    .table {
      padding-inline: 1.5rem;
      gap: 1rem;
    }
  }
</style>
