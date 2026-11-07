<script lang="ts">
  import { installUpdate, snoozeUpdate, updates } from './updates.svelte'
</script>

{#if updates.ready && !updates.snoozed}
  <section class="update" role="status">
    <span>A new version is available.</span>
    <button type="button" class="primary" onclick={installUpdate}>Update</button>
    <button type="button" class="close" aria-label="Hide this for now" onclick={snoozeUpdate}>&times;</button>
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
  .close {
    padding: 0.3rem 0.65rem;
    font-size: 1.3rem;
    line-height: 1;
    background: transparent;
  }
</style>
