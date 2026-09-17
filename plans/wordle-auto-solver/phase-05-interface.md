---
phase: 5
title: "Phase 5: Interface"
status: todo
priority: P1
effort: "5h"
dependencies: [4]
---

# Phase 5: Interface

## Goal

Lock the bundle boundary with a fitness test written *before* the page code, then render the
board, controls, status and outcome with CSS Modules and accessible markup, and verify the
running app by hand.

## Context Links

- Specification: [plan.md](./plan.md) §3 (user flow), §10 (UI behaviour), §13 (project
  structure), §17 (acceptance criteria 7 and 8)
- Source docs:
  [architecture.md](../../docs/architecture.md#boundaries),
  [decisions.md](../../docs/decisions.md#testing)

## Key Insights

- The boundary test is written **first**, before any page markup, and must be observed
  failing — a fitness test never seen failing is a fitness test that may not work.
- The two word lists total ~13,000 words. Shipping them in the initial bundle would dominate
  it, which is the entire reason for the dynamic import.
- A static source-text check beats a bundle-size assertion: it is fast, needs no build step,
  and fails with the offending import line rather than a byte count.
- Tile colour alone conveys nothing to a screen reader or a colour-blind viewer, and the game
  plays itself, so nothing prompts a screen-reader user to re-check the page. Hence
  `aria-label` per tile and two `aria-live="polite"` regions.

## Requirements

Functional: [plan.md](./plan.md) §5 requirement 23 in full, and §10's complete UI behaviour
list.

Non-functional:

- The page never statically imports the solver or word lists.
- `npm run build` produces the solver and lists as a separate lazily loaded chunk, not in the
  route's first-load JS.
- No automated UI tests (**R14**); the page is checked by hand.

## Architecture

Phase 4 built steps 1–4, 9 and 10 of the runtime workflow ([plan.md](./plan.md) §3); Phase 1
built steps 5–8. This phase adds the visible surface around them and the static guarantee
that the solver is reached only through `await import()`.

## Files to Create / Modify

- Create: `src/app/page.module.css`
- Modify: `src/app/page.tsx` (rendering), `src/app/layout.tsx`, `src/app/globals.css`
- Modify: `tests/bundle-boundaries.test.ts` (extend)

## Tests Before

- [ ] The type-only-import fitness case, parameterised over four files, written before any
      page markup and observed red for the stated reason.

## Tasks & Steps

- [ ] **5.1 Reserve the boundary test first.** Before writing any page code, extend
  `tests/bundle-boundaries.test.ts` with the case architecture.md names, parameterised over a
  file list:

  ```ts
  const FILES = [
    "src/app/page.tsx",
    "src/lib/outcome.ts",
    "src/lib/game-state.ts",
    "src/lib/guess-client.ts",
  ];
  ```

  Case name: **"`{file}` imports solver/word-list modules as types only"**. Read each file and
  assert no reference to `lib/solver`, `./solver`, `lib/words`, `./words` or
  `allowed-guesses` appears in a value-import position. **Scan the whole file text**, as in
  task 1.3: a static `import … from "…"` counts unless it is `import type`, and a dynamic
  `await import("…")` or `require("…")` counts too — a dynamic aliased import is exactly the
  form an auto-import tool produces and a line-prefix scan misses.

  It is red now, and the reason must be stated honestly: `src/app/page.tsx` exists (Phase 1
  created it as a placeholder, Phase 4 added the loop), so it is not red because a file is
  missing. It is red because the assertion that the solver is reached dynamically **and only
  dynamically** is not yet fully satisfied in the rendered page. Use the same honest framing
  the plan uses for the fitness tests that are green from birth (1.3, 1.4).

  The three `src/lib` files are listed because they sit in the page's static import graph: a
  value import of `Result` in any of them pulls the solver — and through it both word lists —
  into the initial bundle just as surely as a page-level import would. All three already
  satisfy this from Phases 1 and 4; listing them here keeps them that way.
- [ ] **5.2 Verify the dynamic import both ways.** With the loop from 4.9 in place, 5.1's case
  must pass. Then **verify the failure deliberately**: temporarily convert
  `await import("../lib/solver")` to a static top-level import, watch the case go red, then
  revert. Import `MAX_GUESSES` from `../lib/constants`, `postGuess` from
  `../lib/guess-client`, `describeOutcome` from `../lib/outcome` and the reducer from
  `../lib/game-state` — all statically, none of which reaches the word lists.
- [ ] **5.3 Render the controls and status.** The **Solve** button, `disabled` while
  `status === "playing"` and labelled `Solving…` then. The seed, shown once the status is not
  `idle` — it is how a viewer reproduces a game and the provenance of every seed cited in the
  docs. A progress line `Guess {attempt}/{MAX_GUESSES}…` while playing, wrapped in an element
  with `aria-live="polite"` so each new guess is announced. The error message when errored.
- [ ] **5.4 Render the outcome block.** The `result` and optional `detail` from
  `describeOutcome(state.reason, state.rows.length)` when done, in an element with
  `aria-live="polite"` so the final result is announced without the viewer needing to find it
  visually.
- [ ] **5.5 Render the board.** One row per guess with per-letter tiles carrying the feedback
  class **and** an `aria-label` of `"{letter-uppercased}, {result}"` (e.g. `"C, correct"`),
  then empty rows padding to `MAX_GUESSES`. The label is the only way a screen reader — or a
  colour-blind viewer relying on one — learns which result a tile carries.
- [ ] **5.6 Style with CSS Modules.** `page.module.css` with classes for page, controls,
  button, seed, status, error, board, row, tile, the three feedback states, empty, outcome,
  result and detail.
- [ ] **5.7 Layout and global styles.** Finalise `layout.tsx` with metadata and the font
  setup, and `globals.css` with resets and theme variables. Nothing here may import the solver
  or the word lists. **R13** — no Content-Security-Policy; no analytics or error tracking.
- [ ] **5.8 Confirm the chunk split.** Run `npm run build` and inspect the route's first-load
  JS: the solver and word lists should appear as a separate chunk.
- [ ] **5.9 Hand verification.** The page has no automated UI tests and is checked by hand
  ([decisions.md](../../docs/decisions.md#testing)). Walk all five against a running dev
  server:
  1. **A solved game** — rows appear one at a time with a visible pause; the outcome reads
     `Solved in n/6`.
  2. **A `no-candidates` game** — use seed `143462397` (answer `sioux`) if the live API is
     reachable; confirm the explanatory text appears.
  3. **An error path** — stop the dev server mid-game, or point `VOTEE_API_URL` at an
     unreachable host; confirm the error message renders and the board is retained.
  4. **Restart** — click Solve again from a finished game; confirm a fresh board and a new
     seed.
  5. **Rate limit** — issue more than 30 guesses within a minute from one client; confirm the
     retry message reaches the page.

  **R14 — do not** add Playwright or any browser automation to satisfy these. Automated UI
  tests are explicitly out of scope; adding one browser-level test is a future option
  ([plan.md](./plan.md) §19), not this rebuild's scope.

## Refactor

`src/app/page.tsx` gains its rendered output around the Phase 4 loop. The loop body itself is
not rewritten — if rendering work pushes logic into `play()`, that is the "loop drifting
thicker" risk, not a refactor.

## Tests After

5.1's case joins the alias and no-config cases as standing regression pressure. Keep all three
in the suite; the fourth and last fitness case (server `fetch`) lands in Phase 6.

## Success Criteria

- [ ] `npm test` green, including all bundle-boundary cases.
- [ ] `npx tsc --noEmit` and `npm run lint` clean.
- [ ] `npm run build` succeeds and the solver and word lists are a lazily loaded chunk.
- [ ] The boundary case was observed failing against a deliberately hoisted import, then
      reverted.
- [ ] Every tile carries an `aria-label`; the progress line and outcome block are each
      `aria-live="polite"`.
- [ ] All five hand checks completed and their results recorded.

## Verification

```sh
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run dev   # then walk the five hand checks in 5.9
```

## Risk Assessment

| Risk | Mitigation |
|---|---|
| A hoisted import | Some editors and auto-import tooling convert `await import()` to a top-level import without asking; 5.1 catches it, so keep it in the suite |
| A value import of `Result` in `guess-client.ts`, `game-state.ts` or `outcome.ts` | Same regression indirectly, which is why those three files are in the checked list |
| Pausing before the first guess | 600 ms of apparent dead time on click |
| The loop drifting thicker | Scoring, validation or error mapping in the page is logic outside the tested core |
| Hand checks skipped under time pressure | They are the only coverage of the click-to-render journey; record the outcome of each |

## Security Considerations

No CSP by decision (**R13**) — Next.js inline scripts need nonces, and baseline headers are
planned with CI, which is not set up. No analytics or error tracking. The seed is displayed
deliberately and is not sensitive.

## Rollback

Revert `src/app/` to the Phase 1 placeholder. The library layer stays green and complete; only
the visible application is lost.

## Next Steps

Phase 6 audits the whole build against the specification and closes the last boundary.
