<script lang="ts">
  import { installUpdate, snoozeUpdate, updates } from './updates.svelte'
</script>

{#if updates.ready && (!updates.snoozed || updates.installing)}
  <section class="update" role="status" aria-live="polite">
    {#if updates.installing}
      <span class="spinner" aria-hidden="true"></span>
      <span>Updating...</span>
    {:else}
      <span>A new version is available.</span>
      <button type="button" class="primary" onclick={installUpdate}>Update</button>
      <button type="button" class="close" aria-label="Hide this for now" onclick={snoozeUpdate}>&times;</button>
    {/if}
  </section>
{/if}

<style>
  .update {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.6rem 0.7rem 0.6rem 1rem;
    border-radius: 0.9rem;
    background: var(--felt-light);
    box-shadow: 0 0 0 2px var(--gold);
    font-weight: 600;
  }
  .update span {
    flex: 1;
  }
  .update .primary {
    padding: 0.5rem 0.9rem;
  }
  .update .spinner {
    flex: none;
    width: 1.1rem;
    height: 1.1rem;
    border: 3px solid rgb(255 255 255 / 0.25);
    border-top-color: var(--gold);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .update .spinner {
      animation-duration: 2.4s;
    }
  }
  .close {
    padding: 0.3rem 0.65rem;
    font-size: 1.3rem;
    line-height: 1;
    background: transparent;
  }
</style>
