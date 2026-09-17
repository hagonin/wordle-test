# DESIGN.md

Read this before designing, reviewing, or shipping any change to the page: markup,
a CSS Module class, a copy string, a color, a timing. If a change conflicts with a
rule here, the rule wins (or the rule gets changed deliberately, in this file, with a
dated note).

The page's required behavior (states, labels, live regions, the pause) is fixed by
[spec.md §Page](../plans/wordle-auto-solver/spec.md) and
[phase-05-interface.md](../plans/wordle-auto-solver/phase-05-interface.md). This file
covers how that behavior looks and reads. For what the project is, see
[overview.md](overview.md).

## North Star

**One button, one board: watch a program play Wordle.**

The viewer clicks **Solve** and watches guesses land row by row until the game ends.
There is nothing to configure and nothing to type. The page should read as a program
*playing*, not as an answer *appearing*
([decisions.md](decisions.md): the solver runs in the browser for exactly this reason).

## Five rules that override everything

1. **The board is the page.** The 6-row board is the hero and sits at the visual
   center. Controls sit above it, the status and outcome below it. Nothing competes
   with it: no sidebar, no tabs, no stat tiles, no secondary pages.

2. **Show the game, hide the engine.** The viewer sees guesses, colors, a guess
   counter, a seed, and a result. They never see solver words (see
   [Vocabulary](#vocabulary-hide-the-engine)).

3. **One action, always obvious.** **Solve** is the only control. It is disabled and
   reads `Solving…` while a game is playing, and it starts a fresh game from any other
   state. There is no cancel, manual play, word-size picker or settings panel
   ([overview.md](overview.md#scope)).

4. **Pacing is part of the design.** The 600 ms pause between guesses is what makes
   the game watchable. The first guess appears immediately; every later row stays on
   screen for a full interval. Don't shorten, remove or animate over it.

5. **Color is never the only signal.** Every tile carries an `aria-label` such as
   `"C, correct"`, and the progress line and outcome block are `aria-live="polite"`.
   The game plays itself, so nothing else would prompt a screen-reader user to check
   the page.

## Page anatomy

One column, centered, `max-width: 480px`, 16px side gutter on small screens.

```text
┌──────────────────────────────┐
│ Wordle Auto-Solver     (h1)  │
│ [ Solve ]   Seed 143462397   │  controls: button + seed (seed hidden while idle)
│                              │
│ ┌──┬──┬──┬──┬──┐             │
│ │C │R │A │N │E │  row 1      │  board: always 6 rows × 5 tiles
│ ├──┼──┼──┼──┼──┤             │
│ │  │  │  │  │  │  empty      │
│ └──┴──┴──┴──┴──┘ … to row 6  │
│                              │
│ Guess 2/6…                   │  status (aria-live) while playing
│ Solved in 4/6                │  outcome block (aria-live) when done
│ detail line                  │
└──────────────────────────────┘
```

The board keeps its full 6-row height in every state, so nothing below it jumps as
rows fill in.

## Page states

| State | Button | Seed | Board | Below the board |
|---|---|---|---|---|
| `idle` | `Solve`, enabled | hidden | 6 empty rows | nothing, or one short helper line |
| `playing` | `Solving…`, disabled | shown | rows fill in one at a time | `Guess {attempt}/{MAX_GUESSES}…` |
| `done` | `Solve`, enabled | shown | final rows kept | outcome: `result` + optional `detail` |
| `error` | `Solve`, enabled | shown | rows so far kept | error message |

Rows are never cleared when a game ends or fails; the viewer wants to read the board at
exactly that moment. A new **Solve** click is the only thing that resets it.

## The board

**Tiles**

- Square, 56px on desktop and 48px below 400px width, 6px gap between tiles and rows.
- Letter: uppercase, `Inter` 700, 24–28px, centered. Tile letters count as large text,
  which sets the 3:1 contrast floor used below.
- Empty tile: `--bg-base` fill, 2px `--tile-empty-border`, no letter.
- Filled tile: solid feedback color fill, no border, white letter.

**Feedback colors** (white letters pass 3:1 on each)

| State | Token | Value | Contrast with white |
|---|---|---|---|
| `correct` | `--tile-correct` | `#538D4E` | 3.97:1 |
| `present` | `--tile-present` | `#9A8420` | 3.69:1 |
| `absent` | `--tile-absent` | `#787C7E` | 4.21:1 |
| empty border | `--tile-empty-border` | `#D4D4D8` | decorative |

These are slightly darker than the classic Wordle green and yellow, which fall below
3:1 with white text. Don't lighten them back.

**Motion**

- A new row may fade/flip in over at most 200 ms, well inside the 600 ms pause.
- Under `prefers-reduced-motion: reduce`, rows appear with no animation.
- No per-tile staggered reveal that would outlast the pause or delay the live-region
  announcement.

## Vocabulary: hide the engine

Code and docs use engine words ([overview.md](overview.md#terminology)). The page uses
game words.

| Engine word (code, docs) | On the page |
|---|---|
| guess / attempt | guess (`Guess 3/6…`) |
| feedback `correct` / `present` / `absent` | tile color + `aria-label` (`"C, correct"`) |
| seed | Seed (shown in mono so a viewer can reproduce a game) |
| stop reason `solved` / `out-of-guesses` / `no-candidates` | the `describeOutcome` `result` and `detail` text |
| candidates, answer list, allowed-guesses list, slot, naive scoring, solver | never shown |
| HTTP status, route path, Votee host | never shown; errors use the route's plain messages |

## Copy

- **Button**: `Solve` / `Solving…`. No other verbs.
- **Progress**: `Guess {attempt}/{MAX_GUESSES}…`. Always read the cap from
  `MAX_GUESSES`, never a literal `6`.
- **Outcome**: rendered verbatim from `describeOutcome`. The page never builds its own
  outcome text ([spec.md](../plans/wordle-auto-solver/spec.md): keep the component thin).
  - `solved` reads as a plain win: `Solved in 4/6`.
  - `out-of-guesses` explains the word was still possible but six guesses weren't
    enough to narrow it down.
  - `no-candidates` is deliberately light and reads as a quirk of the game, not an
    application failure.
- **Errors**: show the message the route returned (for example "Could not reach the
  Wordle API", or the "busy right now, try again in a moment" wording for rate limits).
  Never show a stack trace, status code or raw JSON.
- Plain sentences, sentence case, no exclamation marks outside the `no-candidates`
  outcome.

## Tone: game quirk vs. real error

The two non-winning outcomes and a real error must not look alike.

| Situation | Treatment |
|---|---|
| `solved` | Outcome block with `--grad-mint` wash; result in `Fraunces`. |
| `out-of-guesses`, `no-candidates` | Outcome block with `--grad-peach` wash; result in `Fraunces`. |
| `error` | No gradient. 1px `--danger` left border, message in `--danger`, body font. |

## Design tokens

Define these in `globals.css`; `page.module.css` only references them.

| Token | Value | Use |
|---|---|---|
| `--bg-base` | `#FFFFFF` | Page background, empty tiles |
| `--bg-subtle` | `#FAFAFA` | Seed chip background |
| `--fg-base` | `#09090B` | Headings, primary button fill |
| `--fg-muted` | `#52525B` | Status line, detail text |
| `--fg-subtle` | `#71717A` | Seed label, helper text |
| `--border` | `#E4E4E7` | 1px borders |
| `--accent` | `#4F46E5` | Focus rings |
| `--danger` | `#B91C1C` | Error text and border |

Plus the four `--tile-*` tokens above.

```css
--grad-mint:  linear-gradient(135deg, #ECFDF3 0%, #D1F4DD 100%);
--grad-peach: linear-gradient(135deg, #FFF4EC 0%, #FEE7D6 100%);
```

Gradients appear **only** on the outcome block. Never on tiles, the board, the button,
the error message or the page background.

**Typography**

- `Inter` (sans): body, button, status, tile letters.
- `Fraunces` (serif): the `h1` and the outcome `result` line only.
- `JetBrains Mono`: the seed only.

Load fonts with `next/font` in `layout.tsx`, which keeps them self-hosted with no
third-party request.

**Borders and elevation:** 1px `var(--border)`. No drop shadows except the focus ring.

## Button

- 40px tall, 20px horizontal padding, 8px radius, `--fg-base` fill, white `Inter` 500
  text.
- Hover: slightly lighter fill. Focus-visible: 2px `--accent` ring with a 2px offset.
- Disabled while playing: 50% opacity, `cursor: not-allowed`, label `Solving…`. Keep
  the button's width stable between the two labels so the seed beside it doesn't shift.

## Accessibility checklist

- Every filled tile has `aria-label="{LETTER}, {result}"`. Empty tiles are
  `aria-hidden`.
- Each row is a group whose label names the guess number (for example "Guess 2").
- Progress line and outcome block are separate `aria-live="polite"` regions and stay
  mounted, so announcements aren't lost when they first appear.
- Solve is a real `<button>`, reachable by keyboard, with a visible focus ring.
- Text contrast is at least 4.5:1 for body text and 3:1 for tile letters.
- The layout works at 320px width with no horizontal scroll.

## Implementation constraints

- Styles live in `src/app/page.module.css` (page, controls, button, seed, status, error,
  board, row, tile, `correct`, `present`, `absent`, empty, outcome, result, detail) and
  `src/app/globals.css` (resets and tokens). No Tailwind, CSS-in-JS or UI library.
- Styling work must not add a static import of the solver or word lists to the page;
  `tests/bundle-boundaries.test.ts` enforces this.
- No automated UI tests. The page is checked by hand using the five checks in
  [phase-05-interface.md](../plans/wordle-auto-solver/phase-05-interface.md).

## Never do

- Never show solver internals: candidate counts, word lists, scores, JSON, HTTP codes.
- Never rely on color alone to convey a tile's result.
- Never clear the board when a game ends or errors.
- Never add controls beyond **Solve** without changing the scope in
  [overview.md](overview.md#scope) first.
- Never shorten or animate over the pause between guesses.
- Never apply gradients to tiles, the board, the button or the page background.
- Never stack shadows.
- Never use emoji as icons or decoration. The only emoji allowed is the one inside the
  `describeOutcome` `no-candidates` copy.
- Never write design commentary in HTML.
