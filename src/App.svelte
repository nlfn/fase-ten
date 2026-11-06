<script lang="ts">
  import { createGame } from './engine'
  import Game from './lib/Game.svelte'
  import Setup from './lib/Setup.svelte'
  import type { GameConfig } from './lib/Setup.svelte'
  import { pickBotNames } from './lib/botNames'
  import { clearSession, loadSession } from './lib/storage'
  import type { Session } from './lib/storage'

  let saved = $state.raw<Session | null>(loadSession())
  let session = $state.raw<Session | null>(null)

  function start(config: GameConfig) {
    const players = [
      { name: config.name, isBot: false },
      ...pickBotNames(config.name, config.opponents).map((name) => ({ name, isBot: true })),
    ]
    clearSession()
    session = { state: createGame(players), level: config.level }
  }

  function resume() {
    session = saved
  }

  function leave() {
    session = null
    saved = loadSession()
  }
</script>

{#if session}
  <Game {session} onExit={leave} />
{:else}
  <Setup {saved} onStart={start} onContinue={resume} />
{/if}
