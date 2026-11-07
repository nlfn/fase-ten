# Fase Ten

A browser card game based on Phase 10. Play against 1 or 2 computer players, finish all ten phases first. It is an installable PWA, so it also runs offline and can live on an Android home screen without any app store.

Built with Svelte 5, TypeScript, and Vite.

## Run it

```bash
npm install
npm run dev        # development server with hot reload
npm test           # rules engine and bot tests
npm run check      # type checking
npm run build      # production build into dist/
npm run preview    # serve the production build locally
```

## Put it online

`dist/` is plain static files, so any static host works (GitHub Pages, Netlify, Cloudflare Pages, or your own server). The build uses relative paths, so it works from a sub-folder too. Browsers only allow installing a PWA over HTTPS (localhost is exempt).

On Android, open the site in Chrome and choose Install app (or Add to Home screen). The game is saved in the browser after every move, so closing the app mid-round is fine.

## How the code is organized

```
src/engine/    The game itself. Pure TypeScript, no UI code.
  cards.ts     Cards, 108-card deck, point values, seedable shuffle
  phases.ts    The ten phases, set/run/color validation, hitting, solvers
  game.ts      Game state, turn flow, actions, scoring, winning
  bot.ts       Computer players (easy, medium and expert)
  *.test.ts    Unit tests plus full bot-vs-bot games
src/lib/       The Svelte interface
  Setup.svelte, Game.svelte, CardView.svelte, storage.ts
```

The engine is the important part. Everything a player does is an action (`drawDeck`, `drawDiscard`, `layDown`, `hit`, `discard`) passed to `applyAction(state, action)`, which returns a new state or an error message. Human clicks and bots use exactly the same path, so a bot can never do anything a person could not.

## Rules as implemented

- 108 cards: two of each number 1 to 12 in four colors, 8 Wilds, 4 Skips. Ten cards each.
- Phases: 2 sets of 3; set of 3 + run of 4; set of 4 + run of 4; run of 7; run of 8; run of 9; 2 sets of 4; 7 cards of one color; set of 5 + set of 2; set of 5 + set of 3.
- A turn is draw (deck, or the top discard unless it is a Skip), optionally lay down and hit, then discard.
- After laying down you can add cards to any group on the table, yours or an opponent's, including on the same turn you laid down.
- Going out can happen by hitting or discarding your last card.
- A discarded Skip makes the chosen player lose their next turn. If the first card turned up is a Skip, the first player loses their turn.
- Cards left in hand: 1 to 9 are 5 points, 10 to 12 are 10, Skip is 15, Wild is 25. The player who goes out scores 0.
- You advance only if you laid down your phase. Finish Phase 10 to end the game; if several players finish in the same round, the lowest score wins.

Choices where the official rules are loose or where I picked a house rule:

- Every group needs at least one natural (non-Wild) card. A group of only Wilds is not allowed.
- When a run has spare Wilds, they extend it upward first (downward if it already tops out at 12). A Wild added later by hitting lets the player choose which end.
- The first player rotates each round.

### Fase Ten YouSee

An alternate mode chosen on the welcome screen, played like Yahtzee. Nothing locks you to the next phase. When you lay down, you pick any of the ten phases you have not completed, and that choice is final once the cards are down. A phase counts as completed when the round ends, and only for players who laid down. The game ends the same way as classic: the first players to complete all ten phases, lowest score wins. The computer players take the biggest phase their hand can make. The **Phases** button opens a chart of what each player has completed. In the engine this is `mode: 'yousee'` on the game state, with `done` and `laidPhase` on each player and a `phase` field on the `layDown` action.

### Fase Ten Random

A third mode. Like classic, but each player has their own secret random order for the ten phases, made when the game starts. You only ever see the phase each player is on right now (next to their name and on the Phases chart), never the upcoming ones. If a player does not lay down their phase in a round, they try the same phase again next round. In the engine this is `mode: 'random'` with a shuffled `order` on each player, and `targetPhase(state, player)` gives the phase someone is working on in classic and random games.

## Computer players

All levels follow the same plan: take a discard only if it brings the hand closer to the phase, lay down as soon as possible, hit every card they can (natural cards first, Wilds last), dump Skips on the most dangerous opponent, and discard the highest-point card that does not hurt the phase.

The levels differ in mistakes and memory:

- **Easy** makes deliberate mistakes about a third of the time and remembers nothing about the other players.
- **Medium** plays cleanly but only remembers each opponent's last pickup and last two discards.
- **Expert** plays cleanly and remembers every pickup and discard this round.

Memory is used when choosing a discard. If two discards are otherwise equal, a bot keeps back a card an opponent has been picking up (the same number for a set, a neighbor for a run) and prefers to throw a number that opponent has thrown away. See `recall` and `discardDanger` in `bot.ts`. Saved games and settings from before the rename that say "normal" are read as expert.

In 300 test games each (both seating orders), expert beat easy 269 to 29, medium beat easy 266 to 32, and expert and medium were level, 146 to 150. So memory changes how the bots play more than it changes who wins. Games last about 11 rounds.

To add a smarter player, implement the `Bot` interface in `bot.ts` (`chooseAction(state) => Action`). Ideas: hold a Skip until an opponent is close to going out, estimate how likely a phase is to complete.

## Before sharing it publicly

Phase 10 is a Mattel trademark. A private or hobby project is fine, but if you publish this widely, change the name, and keep the original artwork and branding. The cards here are drawn from scratch.
