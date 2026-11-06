<script lang="ts">
  import { cardLabel } from '../engine'
  import type { Card } from '../engine'

  interface Props {
    card: Card
    size?: 'md' | 'xs' | 'chip'
    selected?: boolean
    glow?: boolean // marks a card that can be taken right now
    marked?: boolean // marks a card that was added to a group recently
    onclick?: () => void
  }

  let { card, size = 'md', selected, glow = false, marked = false, onclick }: Props = $props()
  const label = $derived(marked ? `${cardLabel(card)}, added recently` : cardLabel(card))

  // Each color also has a shape, so cards are readable without relying on hue.
  const SHAPE_PATHS = {
    red: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z',
    blue: 'M4 4h16v16H4z',
    green: 'M12 3l10 18H2z',
    yellow: 'M12 1l11 11l-11 11L1 12z',
  } as const
</script>

{#snippet face()}
  {#if card.kind === 'number'}
    <span class="corner">{card.value}</span>
    <span class="num" class:two={card.value > 9}>{card.value}</span>
    <svg class="shape" viewBox="0 0 24 24" aria-hidden="true"><path d={SHAPE_PATHS[card.color]} /></svg>
  {:else if card.kind === 'wild'}
    <span class="disc"><span class="w">W</span></span>
    <span class="tag">Wild</span>
  {:else}
    <svg class="slash" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2.6" />
      <path d="M6 18L18 6" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
    </svg>
    <span class="tag">Skip</span>
  {/if}
{/snippet}

{#if onclick}
  <button
    type="button"
    class="card {size} {card.kind} {card.kind === 'number' ? card.color : ''}"
    class:selected
    class:glow
    class:marked
    aria-pressed={selected}
    aria-label={label}
    {onclick}
  >
    {@render face()}
  </button>
{:else}
  <div
    role="img"
    class="card {size} {card.kind} {card.kind === 'number' ? card.color : ''}"
    class:selected
    class:marked
    aria-label={label}
  >
    {@render face()}
  </div>
{/if}

<style>
  .card {
    --cw: clamp(50px, 13.5vw, 76px);
    position: relative;
    flex: none;
    width: var(--cw);
    aspect-ratio: 5 / 7;
    font-size: calc(var(--cw) * 0.52);
    border: 0;
    border-radius: 0.2em;
    padding: 0;
    color: #fff;
    background: var(--face, #fff);
    box-shadow:
      0 0 0 0.04em rgb(255 255 255 / 0.9) inset,
      0 0.06em 0.12em rgb(0 0 0 / 0.35);
    font-family: inherit;
    font-weight: 800;
    line-height: 1;
    display: grid;
    place-items: center;
    cursor: default;
    transition:
      transform 120ms ease-out,
      box-shadow 120ms ease-out;
  }
  .card.xs {
    --cw: clamp(30px, 8vw, 38px);
  }
  /* A small inline label for lists, wide rather than tall. */
  .card.chip {
    --cw: 2.3rem;
    aspect-ratio: 1.25 / 1;
    font-size: 1rem;
    border-radius: 0.3rem;
  }
  button.card {
    cursor: pointer;
  }
  button.card:hover {
    transform: translateY(-0.08em);
  }
  .card.selected {
    transform: translateY(-0.2em);
    box-shadow:
      0 0 0 0.07em #ffd84d,
      0 0.2em 0.3em rgb(0 0 0 / 0.45);
  }
  .card.glow {
    box-shadow:
      0 0 0 0.07em #ffd84d,
      0 0.06em 0.12em rgb(0 0 0 / 0.35);
  }
  .card.marked {
    box-shadow:
      0 0 0 0.07em #6ee7f9,
      0 0 0.55em 0.1em rgb(110 231 249 / 0.75),
      0 0.06em 0.12em rgb(0 0 0 / 0.35);
  }
  .card:focus-visible {
    outline: 3px solid #fff;
    outline-offset: 2px;
  }

  .red {
    --face: #d63c36;
  }
  .blue {
    --face: #2a6bd6;
  }
  .green {
    --face: #218f52;
  }
  .yellow {
    --face: #f0b400;
    color: #1d2230;
  }

  .num {
    font-size: 1em;
    letter-spacing: -0.02em;
    transform: translateY(-0.04em);
  }
  .num.two {
    font-size: 0.8em;
    letter-spacing: -0.07em;
  }
  .corner {
    position: absolute;
    top: 0.1em;
    left: 0.14em;
    font-size: 0.3em;
    font-weight: 700;
    opacity: 0.9;
  }
  .shape {
    position: absolute;
    bottom: 0.1em;
    right: 0.1em;
    width: 0.3em;
    height: 0.3em;
    fill: currentColor;
    opacity: 0.9;
  }

  .wild {
    background: conic-gradient(from 45deg, #d63c36 0 25%, #2a6bd6 0 50%, #218f52 0 75%, #f0b400 0);
  }
  .disc {
    display: grid;
    place-items: center;
    width: 0.78em;
    height: 0.78em;
    border-radius: 50%;
    background: #fff;
    color: #1d2230;
    box-shadow: 0 0 0 0.04em rgb(0 0 0 / 0.2);
  }
  .w {
    font-size: 0.5em;
    font-weight: 900;
  }

  .skip {
    background: #232837;
    color: #fff;
  }
  .slash {
    width: 0.72em;
    height: 0.72em;
    color: #ff6b5e;
  }

  .tag {
    position: absolute;
    bottom: 0.1em;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 0.2em;
    font-weight: 700;
    color: #fff;
    text-shadow: 0 0 0.3em rgb(0 0 0 / 0.7);
  }

  .xs .tag,
  .xs .corner,
  .xs .shape,
  .chip .tag,
  .chip .corner,
  .chip .shape {
    display: none;
  }
  .xs .num,
  .chip .num {
    transform: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .card {
      transition: none;
    }
  }
</style>
