<script lang="ts">
  // Asks before abandoning a game. Keep playing has the focus, and Escape or a tap outside cancels.
  interface Props {
    onCancel: () => void
    onQuit: () => void
  }
  let { onCancel, onQuit }: Props = $props()

  let keepPlaying = $state<HTMLButtonElement>()
  $effect(() => {
    keepPlaying?.focus()
  })
</script>

<div class="modal-backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onCancel()}>
  <div
    class="modal"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="quit-title"
    aria-describedby="quit-text"
    tabindex="-1"
    onkeydown={(e) => e.key === 'Escape' && onCancel()}
  >
    <h2 id="quit-title">Quit this game?</h2>
    <p id="quit-text">
      This will abandon the current game. Your scores and progress will be lost and you will not be able to
      continue it. To pause instead, use Menu.
    </p>
    <div class="quit-actions">
      <button type="button" class="primary" bind:this={keepPlaying} onclick={() => onCancel()}>
        Keep playing
      </button>
      <button type="button" class="danger" onclick={onQuit}>Abandon game</button>
    </div>
  </div>
</div>

<style>
  .quit-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.6rem;
  }
</style>
