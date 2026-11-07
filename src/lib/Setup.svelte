<script lang="ts">
  import { PHASES, targetPhase } from '../engine'
  import type { BotLevel, GameMode } from '../engine'
  import UpdateBanner from './UpdateBanner.svelte'
  import { loadSettings, saveSettings } from './storage'
  import type { Session } from './storage'

  export interface GameConfig {
    name: string
    opponents: 1 | 2 | 3
    level: BotLevel
    mode: GameMode
  }

  interface Props {
    saved: Session | null
    onStart: (config: GameConfig) => void
    onContinue: () => void
  }

  let { saved, onStart, onContinue }: Props = $props()

  // Start from whatever was used for the last game.
  const last = loadSettings()
  let name = $state(last.name ?? 'You')
  let opponents = $state<1 | 2 | 3>(last.opponents ?? 1)
  let level = $state<BotLevel>(last.level ?? 'medium')
  let mode = $state<GameMode>(last.mode ?? 'classic')

  // The date and time are shown in the viewer's own time zone.
  const buildInfo = `${__BUILD_LABEL__}, built ${new Date(__BUILD_TIME__).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`

  const savedSummary = $derived.by(() => {
    if (!saved) return ''
    const me = saved.state.players[0]
    if (saved.state.mode === 'yousee') {
      return `You Pick, round ${saved.state.round}, ${me.phase} of 10 phases done`
    }
    const target = targetPhase(saved.state, me)
    const label =
      saved.state.mode === 'random' ? 'Random, round' : saved.state.mode === 'reverse' ? 'Backwards, round' : 'Round'
    return `${label} ${saved.state.round}, you are on Phase ${(target ?? 0) + 1}`
  })

  function submit(event: SubmitEvent) {
    event.preventDefault()
    const config: GameConfig = { name: name.trim() || 'You', opponents, level, mode }
    saveSettings(config)
    onStart(config)
  }
</script>

<main class="setup">
  <UpdateBanner />
  <header>
    <h1>Fase Ten</h1>
    <p class="lead">Ten-phase rummy against the computer. Finish all ten phases before they do.</p>
  </header>

  {#if saved}
    <section class="resume" aria-label="Saved game">
      <div>
        <strong>Game in progress</strong>
        <span>{savedSummary}</span>
      </div>
      <button type="button" class="primary" onclick={onContinue}>Continue</button>
    </section>
  {/if}

  <form onsubmit={submit}>
    <label class="field">
      <span>Your name</span>
      <input type="text" bind:value={name} maxlength="16" autocomplete="off" />
    </label>

    <fieldset>
      <legend>Fase Ordering</legend>
      <div class="segment wide">
        <label><input type="radio" name="mode" value="classic" bind:group={mode} /><span>Classic</span></label>
        <label><input type="radio" name="mode" value="yousee" bind:group={mode} /><span>You Pick</span></label>
        <label><input type="radio" name="mode" value="random" bind:group={mode} /><span>Random</span></label>
        <label><input type="radio" name="mode" value="reverse" bind:group={mode} /><span>Backwards</span></label>
      </div>
      <p class="hint">
        {#if mode === 'classic'}
          The classic game. Work through the ten phases in order.
        {:else if mode === 'yousee'}
          Like Yahtzee. Each time you lay down, you choose which phase you are completing. Do them in any order, but each phase only once.
        {:else if mode === 'random'}
          Everyone gets their own secret random order for the ten phases. You only see the phase you are on. Miss it and you try it again next round.
        {:else}
          Fase Ten backwards. Everyone starts at the hardest phase, Phase 10, and works down to Phase 1.
        {/if}
      </p>
    </fieldset>

    <fieldset>
      <legend>Computer players</legend>
      <div class="segment three">
        <label><input type="radio" name="opponents" value={1} bind:group={opponents} /><span>1 player</span></label>
        <label><input type="radio" name="opponents" value={2} bind:group={opponents} /><span>2 players</span></label>
        <label><input type="radio" name="opponents" value={3} bind:group={opponents} /><span>3 players</span></label>
      </div>
    </fieldset>

    <fieldset>
      <legend>Difficulty</legend>
      <div class="segment three">
        <label><input type="radio" name="level" value="easy" bind:group={level} /><span>Easy</span></label>
        <label><input type="radio" name="level" value="medium" bind:group={level} /><span>Medium</span></label>
        <label><input type="radio" name="level" value="expert" bind:group={level} /><span>Expert</span></label>
      </div>
      <p class="hint">
        {#if level === 'easy'}
          Easy players miss good cards, sometimes throw away ones they need, and remember nothing about your plays.
        {:else if level === 'medium'}
          Medium players play cleanly but have a short memory: only each player's last pickup and last two discards.
        {:else}
          Expert players grab useful discards, lay down quickly, hit every card they can, and remember every pickup and discard this round.
        {/if}
      </p>
    </fieldset>

    <button type="submit" class="primary big">Start game</button>
  </form>

  <details class="rules">
    <summary>How to play</summary>
    <div class="rules-body">
      <p>
        Each round, collect the cards for your current phase. Every turn you draw a card (from the deck or the
        top of the discard pile), then discard one. Once you have the right cards, lay down your phase. After that
        you can add cards to any group on the table, called hitting. Go out first to end the round.
      </p>
      <p>
        <strong>You Pick:</strong> the same game, but you are not locked to the next phase. When you lay
        down, you pick any phase you have not completed yet, and it is decided once the cards are down. Finish all
        ten in any order. The Phase chart button shows what each player has completed.
      </p>
      <p>
        <strong>Random:</strong> like the classic game, but each player has their own secret random order
        for the ten phases, so everyone is usually on a different phase. You only ever see the phase each player is on
        right now. If you do not complete it, you try the same phase again next round.
      </p>
      <p>
        <strong>Backwards:</strong> also called Net Esaf, Fase Ten spelled backwards. Everyone starts on Phase 10
        and works down to Phase 1. Miss your phase and you try it again next round, the same as the classic game.
      </p>
      <ul>
        <li><strong>Set:</strong> cards with the same number.</li>
        <li><strong>Run:</strong> cards in number order, any colors. No wrapping from 12 to 1.</li>
        <li><strong>Wild:</strong> stands in for any card. Every group needs at least one regular card.</li>
        <li><strong>Skip:</strong> can't be used in a group. Discard it to make another player lose a turn.</li>
        <li><strong>Points left in hand:</strong> 1 to 9 are 5 each, 10 to 12 are 10 each, Skip is 15, Wild is 25.</li>
        <li>You only get credit for a phase if you laid it down. The lowest score wins ties.</li>
      </ul>
      <ol class="phases">
        {#each PHASES as phase (phase.number)}
          <li>{phase.description}</li>
        {/each}
      </ol>
    </div>
  </details>

  <footer>
    <p>Unofficial fan project. Phase 10 is a trademark of Mattel.</p>
    <p class="build">{buildInfo}</p>
  </footer>
</main>

<style>
  .setup {
    max-width: 30rem;
    margin: 0 auto;
    padding: max(1.5rem, env(safe-area-inset-top)) 1.25rem 2rem;
    display: grid;
    gap: 1.5rem;
  }
  h1 {
    margin: 0;
    font-size: clamp(3rem, 14vw, 4.5rem);
    font-weight: 900;
    letter-spacing: -0.04em;
    line-height: 0.95;
  }
  .lead {
    margin: 0.75rem 0 0;
    color: var(--text-dim);
    max-width: 26ch;
    font-size: 1.1rem;
    line-height: 1.4;
  }

  .resume {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.9rem 1rem;
    border-radius: 0.9rem;
    background: var(--felt-light);
    box-shadow: 0 0 0 2px var(--gold);
  }
  .resume div {
    display: grid;
  }
  .resume span {
    color: var(--text-dim);
    font-size: 0.9rem;
  }

  form {
    display: grid;
    gap: 1.25rem;
  }
  .field {
    display: grid;
    gap: 0.4rem;
    font-weight: 600;
  }
  input[type='text'] {
    font: inherit;
    padding: 0.75rem 0.9rem;
    border-radius: 0.7rem;
    border: 2px solid transparent;
    background: var(--felt-deep);
    color: var(--text);
  }
  input[type='text']:focus-visible {
    outline: none;
    border-color: var(--gold);
  }
  fieldset {
    border: 0;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.5rem;
  }
  legend {
    padding: 0;
    margin-bottom: 0.4rem;
    font-weight: 600;
  }
  .segment {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }
  .segment.wide {
    grid-template-columns: 1fr;
  }
  .segment.three {
    grid-template-columns: repeat(3, 1fr);
  }
  .segment label {
    position: relative;
  }
  .segment input {
    position: absolute;
    opacity: 0;
    inset: 0;
    cursor: pointer;
  }
  .segment span {
    display: block;
    padding: 0.8rem;
    text-align: center;
    font-weight: 700;
    border-radius: 0.7rem;
    background: var(--felt-deep);
    border: 2px solid transparent;
  }
  .segment input:checked + span {
    background: var(--gold);
    color: var(--ink);
  }
  .segment input:focus-visible + span {
    outline: 3px solid #fff;
    outline-offset: 2px;
  }
  .hint {
    margin: 0;
    color: var(--text-dim);
    font-size: 0.9rem;
    min-height: 2.6em;
  }
  .big {
    padding: 1rem;
    font-size: 1.15rem;
  }

  .rules {
    border-top: 1px solid rgb(255 255 255 / 0.15);
    padding-top: 1rem;
  }
  summary {
    cursor: pointer;
    font-weight: 700;
  }
  summary:focus-visible {
    outline: 3px solid #fff;
    outline-offset: 3px;
  }
  .rules-body {
    display: grid;
    gap: 0.8rem;
    margin-top: 0.8rem;
    color: var(--text-dim);
    line-height: 1.5;
  }
  .rules-body p,
  .rules-body ul,
  .rules-body ol {
    margin: 0;
  }
  .rules-body ul {
    padding-left: 1.1rem;
    display: grid;
    gap: 0.35rem;
  }
  .rules-body strong {
    color: var(--text);
  }
  .phases {
    padding-left: 1.6rem;
    columns: 2;
    column-gap: 1.5rem;
  }
  .phases li {
    break-inside: avoid;
    padding: 0.1rem 0;
  }

  footer {
    color: var(--text-dim);
    font-size: 0.8rem;
  }
  footer p {
    margin: 0;
  }
  .build {
    margin-top: 0.25rem;
    font-size: 0.75rem;
    opacity: 0.8;
  }
</style>
