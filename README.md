# Fase Ten

A browser card game based on Phase 10. Play against 1, 2 or 3 computer players, finish all ten phases first. It is an installable PWA, so it also runs offline and can live on an Android home screen without any app store.

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
- A discarded Skip makes the chosen player lose their next turn. Skips do not stack: a player who is already losing a turn cannot be skipped again. If the first card turned up is a Skip, the first player loses their turn.
- Cards left in hand: 1 to 9 are 5 points, 10 to 12 are 10, Skip is 15, Wild is 25. The player who goes out scores 0.
- You advance only if you laid down your phase. Finish Phase 10 to end the game; if several players finish in the same round, the lowest score wins. If the lowest score is tied and at least one person is among the tied players, they play a tiebreaker: each repeats their final phase in a fresh round (everyone else sits out), and the first to go out wins. No points are added. If only computer players are tied, the winner is drawn at random from the game's seed instead. In the engine this is `tieNext` (a pending tiebreaker) and `tiebreak` (the tied players while it is being played) on the game state.

Choices where the official rules are loose or where I picked a house rule:

- Every group needs at least one natural (non-Wild) card. A group of only Wilds is not allowed.
- When a run has spare Wilds, they extend it upward first (downward if it already tops out at 12). A Wild added later by hitting lets the player choose which end.
- The first player rotates each round.

### You Pick (YouSee in the code)

An alternate mode chosen on the welcome screen, played like Yahtzee. Nothing locks you to the next phase. When you lay down, you pick any of the ten phases you have not completed, and that choice is final once the cards are down. A phase counts as completed when the round ends, and only for players who laid down. The game ends the same way as classic: the first players to complete all ten phases, lowest score wins. The computer players take the biggest phase their hand can make. The **Phases** button opens a chart of what each player has completed. In the engine this is `mode: 'yousee'` on the game state, with `done` and `laidPhase` on each player and a `phase` field on the `layDown` action.

### Random

A third mode. Like classic, but each player has their own secret random order for the ten phases, made when the game starts. You only ever see the phase each player is on right now (next to their name and on the Phases chart), never the upcoming ones. If a player does not lay down their phase in a round, they try the same phase again next round. In the engine this is `mode: 'random'` with a shuffled `order` on each player, and `targetPhase(state, player)` gives the phase someone is working on in classic and random games.

### Backwards (Net Esaf)

A fourth mode, Fase Ten spelled backwards. Everyone starts on Phase 10 and works down to Phase 1, one phase at a time, and a missed phase is tried again next round. In the engine this is `mode: 'reverse'`: every player's `order` is the plain order reversed, so `targetPhase` does the rest.

### Single round

A fifth way to play, picked under Phases on the welcome screen: one round on one phase from any list (classic, alternate, or the other candidates), with a picker. The game is over when the round ends, and whoever went out scores zero and wins. In the engine this is `mode: 'single'` with `phaseSet: 'single:<code>'`. The code spells out the groups of the phase (`s3-s3` is 2 sets of 3, `r4-s3` a run of 4 and a set of 3, `e5` a run of 5 evens, `k6` a color run of 6, `b8` a rainbow run of 8, `r6n` a run of 6 with no Wilds (`p6` still reads the same), `c7` 7 of one color, `o` for odds), so a saved game needs no lookup table. `encodeGroups`, `decodeGroups`, `describeGroups` and `groupsProblem` in `phases.ts` convert and check these codes. All ten slots hold that one phase and every player starts on the last one with the others marked done, so the existing "finish the last phase" rule ends the game.

### Designing a phase

Under Single, the Design button opens a builder: up to four groups (set, run, all one color, evens, odds, color run, rainbow run), each with a size and an optional No Wilds switch, up to ten cards in all (`groupsProblem` explains anything impossible, such as a rainbow run that is not a multiple of 4 or a set of 9 with no Wilds). `noWild` is a flag on any group: no Wilds may be used to lay that group down, though a Wild can be added to it once it is on the table. The estimate (`phaseMissing`) counts the strict groups as getting first pick of the naturals and never lets a Wild close a gap in one. Codes carry the flag as an `n` suffix (`s3-r4n` is a set of 3 and a run of 4 with no Wilds). The last phase picked is remembered, a named list lives under My phases (`fase-ten:custom-phases:v1`, on that device only), and a code or a link (`?phase=s3-r4n`) shares one.

### Alternate phases

A second list of ten phases, chosen on the welcome screen (`phaseSet: 'alternate'` on the game state). It works with every ordering above. Easiest first:

1. 2 sets of 3 + 1 set of 2
2. 2 color runs of 3
3. 1 run of 5 evens + 1 set of 3
4. 1 rainbow run of 8
5. 1 run of 6 odds + 1 set of 3
6. 3 sets of 3
7. 1 run of 6 (no wilds)
8. 1 rainbow run of 4 + 1 set of 4
9. 1 run of 10
10. 1 color run of 6

New kinds of group (all in `phases.ts`):

- **Run of evens or odds** steps by two. A run of five evens is 2 to 10 or 4 to 12 and can grow by the next even number at either end. A run of six evens (2 to 12) or odds (1 to 11) is complete and takes no hits, not even a Wild.
- **Color run** (a run in one color) only takes cards of that color (or a Wild) when hit.
- **Rainbow run** (one of each color in a run of four, two of each in a run of eight; the word is drawn in the four colors in the Phases table) is checked when laid down, with Wilds filling the gaps. Afterwards it is an ordinary run, so any color can be added.
- **Run of 6 (no Wilds)** cannot be laid down with a Wild in it. Wilds are only useful for adding to groups already on the table, so bots discard them before laying down (`allowsWilds`). Hitting with a Wild afterwards is allowed.
- A phase can have up to four groups.

How the ten were chosen: the candidates in `ALTERNATE_CANDIDATES` (about 40 of them) were simulated with three Expert bots at a table where everyone is on a random phase (several thousand rounds each). The measure is the share of players who laid down before the round ended. The ten above score about 85, 71, 74, 64, 64, 63, 63, 61, 63 and 48% (Easy bots: 85, 75, 70, 67, 59, 61, 62, 60, 56 and 48%), and the opener takes about 3 to 4 turns to lay down instead of 2. Classic ranges from 92% to 46%. The run of 6 in one color is kept as Phase 10 on purpose: it is the hardest, and right after the run of 10 (whoever lays that down goes out at once), so the last rounds have a single person going out rather than the same player repeatedly ending the round on someone who is already on the last phase. Swapping a phase means editing `ALTERNATE_ORDER`.

## Computer players

All levels follow the same plan: take a discard only if it brings the hand closer to the phase, lay down as soon as possible, hit every card they can (natural cards first, Wilds last), dump Skips on the most dangerous opponent, and discard the highest-point card that does not hurt the phase.

The levels differ in mistakes and memory:

- **Easy** makes deliberate mistakes about a third of the time and remembers nothing about the other players.
- **Medium** makes a mistake about one move in five (20% of the time), adds cards to the table one at a time without planning ahead, and only remembers each opponent's last pickup and last two discards.
- **Expert** plays cleanly and remembers every pickup and discard this round.

Hitting looks ahead (`hitPlan.ts`, Easy and Expert; Medium hits greedily): after laying down, a bot searches the order in which it can add its cards to the table and plays the card that leaves the least behind. This matters most for Wilds, which have to bridge a gap on a run (a Wild as the 5 and another as the 4 so a 3 and a 2 can follow) instead of going on someone else's set. The "auto lay down" button uses the same logic, so it plays out your whole hand the best way it can find.

Defense (every level, apart from the deliberate mistakes of Easy and Medium): an opponent who has laid down can add cards to any group on the table, so a discard that fits a group is a gift. If a laid-down opponent has two cards or fewer, a bot will not discard a card the table can use unless every card it holds is usable, and it aims its Skips at that player first. With bigger opponent hands, usable cards are only a light tie-break.

Skip targeting (every level): a player on their last phase is the first choice, since they can end the whole game, then a player on their second to last phase, with a smaller nudge for the one before that. When two opponents are equally dangerous the Skip goes to the lowest total score, and if that is tied too, to a random one.

Memory is used when choosing a discard. If two discards are otherwise equal, a bot keeps back a card an opponent has been picking up (the same number for a set, a neighbor for a run) and prefers to throw a number that opponent has thrown away. See `recall` and `discardDanger` in `bot.ts`. Saved games and settings from before the rename that say "normal" are read as expert.

In 500 test games per pairing (all four game styles, both seating orders), Expert beat Medium 71% to 29%, Medium beat Easy 70% to 30%, and Expert beat Easy 85% to 15%. The levels are set in the `RULES` table at the top of `bot.ts`. Games last about 11 rounds.

To add a smarter player, implement the `Bot` interface in `bot.ts` (`chooseAction(state) => Action`). Ideas: hold a Skip until an opponent is close to going out, estimate how likely a phase is to complete.

## Before sharing it publicly

Phase 10 is a Mattel trademark. A private or hobby project is fine, but if you publish this widely, change the name, and keep the original artwork and branding. The cards here are drawn from scratch.

## Updates

The app is a PWA, so a phone keeps running the version it already has. It looks for a newer one when it opens, whenever it comes back to the foreground, and once an hour. When a new version has been downloaded, the welcome screen shows a "new version available" banner with an Update button, and an x that hides it for a day. The app never reloads by itself, and the banner is only on the welcome screen, so a game in progress is not interrupted. See `src/lib/updates.svelte.ts` and `UpdateBanner.svelte`.

After an update, the welcome screen also shows a "What's new" list of the changes since the last version that browser opened. The entries live in `src/lib/changelog.ts`: add one with the next number for any change worth mentioning (no em dashes, plain text). The newest number seen is kept in localStorage. A brand new player sees nothing, and a returning player who has never seen the list gets all of it once.
