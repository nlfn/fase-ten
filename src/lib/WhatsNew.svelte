<script lang="ts">
  import { CHANGELOG, LATEST_CHANGE_ID } from './changelog'
  import { SEEN_KEY, groupByDate, unseenEntries } from './whatsNew'

  function read(key: string): string | null {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  }

  // Someone who has played here before has a saved game or saved settings.
  const hasSavedData = read('fase-ten:session:v1') !== null || read('fase-ten:settings:v1') !== null
  const entries = unseenEntries(CHANGELOG, read(SEEN_KEY), hasSavedData)
  const groups = groupByDate(entries)

  let open = $state(entries.length > 0)

  function remember() {
    try {
      localStorage.setItem(SEEN_KEY, String(LATEST_CHANGE_ID))
    } catch {
      // Without storage the list simply shows again next time.
    }
  }

  // A brand new player has nothing to catch up on, so start counting from the current version.
  if (entries.length === 0) remember()

  function close() {
    remember()
    open = false
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
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="whats-new-title">
      <div class="head">
        <h2 id="whats-new-title">What's new</h2>
        <button type="button" class="x" aria-label="Close" onclick={close}>&times;</button>
      </div>
      <p>Here is what changed since the last version you opened.</p>
      <div class="list">
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
      <button type="button" class="primary done" bind:this={closeButton} onclick={close}>Got it</button>
    </div>
  </div>
{/if}

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
  }
  .x {
    padding: 0.3rem 0.65rem;
    font-size: 1.4rem;
    line-height: 1;
    background: transparent;
  }
  .done {
    position: sticky;
    bottom: 0;
  }
  .list {
    display: grid;
    gap: 0.4rem;
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
