<script lang="ts">
  import { CHANGELOG, LATEST_CHANGE_ID } from './changelog'
  import { SEEN_KEY, groupByDate, unseenEntries } from './whatsNew'

  interface Props {
    /** Set to true to list every change, not just the ones not seen yet. */
    showAll?: boolean
  }

  let { showAll = $bindable(false) }: Props = $props()

  function read(key: string): string | null {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  }

  // Someone who has played here before has a saved game or saved settings.
  const hasSavedData = read('fase-ten:session:v1') !== null || read('fase-ten:settings:v1') !== null
  const unseen = unseenEntries(CHANGELOG, read(SEEN_KEY), hasSavedData)

  let autoOpen = $state(unseen.length > 0)
  const open = $derived(showAll || autoOpen)
  const groups = $derived(groupByDate(showAll ? CHANGELOG : unseen))

  function remember() {
    try {
      localStorage.setItem(SEEN_KEY, String(LATEST_CHANGE_ID))
    } catch {
      // Without storage the list simply shows again next time.
    }
  }

  // A brand new player has nothing to catch up on, so start counting from the current version.
  if (unseen.length === 0) remember()

  function close() {
    remember()
    autoOpen = false
    showAll = false
  }

  let closeButton = $state<HTMLButtonElement>()
  $effect(() => {
    if (open) closeButton?.focus({ preventScroll: true })
  })

  function keydown(event: KeyboardEvent) {
    if (open && event.key === 'Escape') close()
  }
</script>

<svelte:window onkeydown={keydown} />

{#if open}
  <div class="modal-backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && close()}>
    <div class="modal wn" role="dialog" aria-modal="true" aria-labelledby="whats-new-title">
      <div class="head">
        <h2 id="whats-new-title">What's new</h2>
        <button type="button" class="x" aria-label="Close" bind:this={closeButton} onclick={close}>&times;</button>
      </div>
      <div class="body">
        <p>{showAll ? 'Everything that has changed so far.' : 'Here is what changed since the last version you opened.'}</p>
        {#each groups as group (group.date)}
          <h3>{group.date}</h3>
          {#each group.items as entry (entry.id)}
            <details>
              <summary>{entry.title}</summary>
              <p>{entry.body}</p>
            </details>
          {/each}
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  /* The heading and its x stay put while the list scrolls under them. */
  .wn {
    padding: 0;
    gap: 0;
  }
  .head {
    position: sticky;
    top: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    padding: 1rem 1.2rem 0.6rem;
    background: var(--felt);
    z-index: 1;
  }
  .body {
    display: grid;
    gap: 0.4rem;
    padding: 0 1.2rem 1.2rem;
  }
  .x {
    padding: 0.3rem 0.65rem;
    font-size: 1.4rem;
    line-height: 1;
    background: transparent;
  }
  h3 {
    margin: 0.5rem 0 0;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-dim);
  }
  details {
    padding: 0.7rem 0.9rem;
    border-radius: 0.8rem;
    background: var(--felt-light);
  }
  summary {
    cursor: pointer;
    font-weight: 700;
  }
  details p {
    margin-top: 0.5rem;
  }
</style>
