// What changed in each version, newest first. Add an entry here with the next number whenever a
// change is worth telling players about: the "What's new" screen shows everything they have not
// seen yet after an update. Keep titles short and the text plain.

export interface ChangeEntry {
  /** Counts up by one with every entry. Never reuse or renumber one. */
  id: number
  /** YYYY-MM-DD */
  date: string
  title: string
  body: string
}

export const CHANGELOG: ChangeEntry[] = [
  {
    id: 16,
    date: '2026-11-08',
    title: 'Tiebreaker round',
    body: 'If you are tied for the lowest score after the final phase, the tied players now repeat their final phase and the first one out wins, as in the official rules. Anyone else sits that round out. If only computer players are tied, the winner is simply drawn at random.',
  },
  {
    id: 15,
    date: '2026-11-08',
    title: 'Scores and Phases in one place',
    body: 'The Scores and Phases tables now share one window. Tap a tab or swipe sideways to switch, and close it with the x at the top. The end of round page has links to both, and the "shut out" label on the scoreboard fits on one line.',
  },
  {
    id: 14,
    date: '2026-11-08',
    title: 'Medium watches the table',
    body: 'Medium now avoids discarding a card an almost-finished opponent can play, like Easy and Expert. To keep it a step below Expert, it makes a few more mistakes.',
  },
  {
    id: 13,
    date: '2026-11-07',
    title: 'Skips no longer stack',
    body: 'Following the official rules, a player who is already losing a turn cannot be skipped again. You can only play a Skip on someone who is not already skipped.',
  },
  {
    id: 12,
    date: '2026-11-07',
    title: 'Update button shows progress',
    body: 'Tapping Update on the welcome screen now shows a spinner and "Updating..." while the new version loads, instead of looking like nothing happened.',
  },
  {
    id: 11,
    date: '2026-11-07',
    title: 'This What\'s new screen',
    body: 'After an update, the welcome screen now lists what changed since the last version you opened.',
  },
  {
    id: 10,
    date: '2026-11-07',
    title: 'Smarter Skips',
    body: 'Computer players now Skip anyone closing in on the end of the game, starting two phases out. When two opponents look equally dangerous, the Skip goes to the one with the lowest total score, and if that is tied too, to a random one. You are no longer the default target.',
  },
  {
    id: 9,
    date: '2026-11-07',
    title: 'Going out is automatic',
    body: 'Once you have laid down, playing a card that leaves one card in your hand discards it for you and ends the round. Auto play does the same.',
  },
  {
    id: 8,
    date: '2026-11-07',
    title: 'Wilds bridge your own run',
    body: 'Auto lay down and the computer players now look ahead before adding cards to the table, so Wilds fill the gap in your own run instead of landing on someone else\'s group.',
  },
  {
    id: 7,
    date: '2026-11-07',
    title: 'Computer players, tuned',
    body: 'Expert remembers the whole round, Medium remembers only the last card each player picked up and their last two discards, and Easy remembers nothing and makes deliberate mistakes. Easy and Expert also avoid discarding a card an almost-finished opponent can play.',
  },
  {
    id: 6,
    date: '2026-11-07',
    title: 'Update banner and no stray selections',
    body: 'A new version now shows a banner on the welcome screen, never in the middle of a game. Tap Update, or hide it for a day. Text on the table can no longer be selected by accident.',
  },
  {
    id: 5,
    date: '2026-11-07',
    title: 'Scoreboard colors',
    body: 'Points are green if the player laid down and red if they were caught with a full hand. Whoever went out is boxed, and a round where you never got a turn is marked shut out.',
  },
  {
    id: 4,
    date: '2026-11-06',
    title: 'Four ways to order the phases',
    body: 'Fase Ordering now has Classic, You Pick (choose any phase you have not done), Random (your own secret order), and Backwards (Phase 10 down to Phase 1).',
  },
  {
    id: 3,
    date: '2026-11-06',
    title: 'Up to three computer players, plus Medium',
    body: 'Play against one, two or three computer players. Pick Easy, Medium or Expert. Names are shuffled so the same opponent is not always second.',
  },
  {
    id: 2,
    date: '2026-11-06',
    title: 'Lay down button',
    body: 'Lay down stays grey until you can lay down a phase.',
  },
  {
    id: 1,
    date: '2026-11-06',
    title: 'Scores and recent plays',
    body: 'The Scores button shows the totals after each round. Recent plays are grouped into one row per turn, with a filter for each player.',
  },
]

export const LATEST_CHANGE_ID = CHANGELOG[0].id
