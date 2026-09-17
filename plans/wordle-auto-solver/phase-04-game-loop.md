---
phase: 4
title: "Phase 4: Game Loop"
status: todo
priority: P1
effort: "4h"
dependencies: [3]
---

# Phase 4: Game Loop

## Goal

Build the two pure modules that let the page stay thin — `gameReducer` and
`describeOutcome` — and wire the browser game loop that drives the solver through
`postGuess` with a visual pause between guesses.

## Context Links

- Specification: [plan.md](./plan.md) §7 (types), §9 (game controller), §10 (outcome text),
  §12 (reducer edge cases)
- Source docs:
  [technical-analysis.md](../../docs/technical-analysis.md#design-patterns),
  [decisions.md](../../docs/decisions.md#the-browser-runs-the-solver-the-server-relays-single-guesses)

## Key Insights

- **Invalid transitions are ignored, not thrown.** The page has no cancellation, by scope, so
  an in-flight async guess that resolves after a game has ended must dispatch harmlessly.
  Throwing would crash the page.
- In-place mutation passes the behavioural cases and silently breaks rendering: React's
  `useReducer` would stop re-rendering between guesses even though the state is "correct".
- `describeOutcome` returns `{ result, detail }` rather than a formatted string so the page
  can style headline and explanation separately without parsing text.
- Both modules are statically imported by the page, so both import solver types with
  `import type` only.

## Requirements

Functional: [plan.md](./plan.md) §5 requirement 23 (the loop and pause parts), §9 in full,
§10's outcome-text table.

- `idle` → `start` → `playing` with the seed, empty rows, attempt 0.
- While `playing`: `attempt` updates the counter; `row` appends; `finish` → `done` keeping
  seed and rows; `fail` → `error` keeping seed, rows and message.
- `start` while already `playing` is ignored; `start` from `done`/`error` fully resets.
- Every action other than `start` is ignored outside `playing`.
- State is never mutated in place.

## Architecture

```text
page.tsx play()
  ├─ seed = Math.floor(Math.random() * 1_000_000_000)   (once per game)
  ├─ dispatch start
  ├─ guessFn(word): pause(if n>0) → dispatch attempt → postGuess → dispatch row → feedback
  ├─ const { solve } = await import("../lib/solver")    (dynamic — Phase 5 enforces it)
  ├─ await solve(guessFn) → dispatch finish
  └─ catch → dispatch fail(err.message)
```

## Files to Create / Modify

- Create: `src/lib/game-state.ts`, `src/lib/outcome.ts`
- Create: `tests/game-state.test.ts`, `tests/outcome.test.ts`
- Modify: `src/app/page.tsx` (replace the Phase 1 placeholder with the client component and
  loop; rendering and styling land in Phase 5)

## Tests Before

| Test file | Cases first red |
|---|---|
| `game-state.test.ts` | start-from-idle, progress, two terminal transitions, two ignore cases, two restart cases, no-mutation |
| `outcome.test.ts` | solved, out-of-guesses, no-candidates |

The loop itself (4.9) has **no automated test** — automated UI tests are out of scope
(**R14**). What Phase 5's fitness case pins statically is the dynamic import; what Phases 1–3
pin is every unit the loop composes.

## Tasks & Steps

### Group A — State machine (4.1–4.7)

- [ ] **4.1 Starting a game.** `describe("gameReducer")`, case **"start from idle begins a
  fresh game"**: from `initialGameState`, dispatch `{ type: "start", seed: 123 }`; assert
  `{ status: "playing", seed: 123, rows: [], attempt: 0 }`. Implement a `switch` on
  `action.type` with the `start` case.
- [ ] **4.2 Progress while playing.** Case **"attempt and row apply while playing, in
  order"**: from a playing state dispatch `attempt 1`, a `row`, `attempt 2`, a second `row`;
  assert the counter and that rows accumulate in dispatch order. Implement `attempt` as
  `{ ...state, attempt }` and `row` as `{ ...state, rows: [...state.rows, action.row] }`.
- [ ] **4.3 Terminal transitions.** Two cases: **"finish while playing moves to done, keeping
  seed and rows"** and **"fail while playing moves to error, keeping seed, rows and
  message"**. Preserving rows through both is what keeps the board on screen after the game
  ends; dropping them would blank the board at the moment the viewer wants to read it. Build
  the new state explicitly from `state.seed` and `state.rows`.
- [ ] **4.4 Invalid transitions are ignored.** Case **"ignores start while already playing"**
  — dispatch `start` with a different seed into a playing state with rows and assert the
  **identical object** is returned (`toBe`, not `toEqual`), so a restart cannot wipe a game in
  progress. Then a table-driven case **"ignores row, attempt, finish and fail while
  {name}"** over `idle`, `done` and `error`, asserting each returns the same state object.
  Red for a reducer that applies actions unconditionally, or one that **throws** — throwing
  would crash the page when a late guess resolves after a `fail`. Implement by guarding each
  non-`start` case with `if (state.status !== "playing") return state;` and `start` with
  `if (state.status === "playing") return state;`.
- [ ] **4.5 Restart from a terminal state.** Cases **"start from done begins a fresh game with
  empty rows"** and **"start from error begins a fresh game with empty rows"**: assert the new
  seed is adopted and `rows` is empty, not carried over. This pairs with 4.4 — `start` is
  ignored only while playing. Without it, clicking Solve again would append to the previous
  game's board.
- [ ] **4.6 No mutation.** Case **"does not mutate the input state or its rows array on
  row"**: capture the original state and a reference to its `rows` array, dispatch a `row`,
  assert the original array is unchanged in length and content and that the returned `rows` is
  a different array object. Red for a `state.rows.push(...)` implementation, which passes 4.2
  but breaks React's re-render detection. Spread, never push.
- [ ] **4.7 Exhaustiveness.** *No runtime test*; this is a type-level property checked by
  `npx tsc --noEmit`. Omitting `default` does **not** by itself make an unhandled union member
  a compile error — a `switch` with no `default` simply falls through. Add an explicit guard:

  ```ts
  default: {
    const _exhaustive: never = action;
    return state;
  }
  ```

  **Verify the guard works:** temporarily add a variant to `GameAction`, confirm
  `npx tsc --noEmit` fails on the `never` assignment, then revert. **Do not** write a bare
  `default: return state` — it handles the unhandled case silently and removes the only
  guarantee that every future action is considered.

### Group B — Outcome text (4.8)

- [ ] **4.8 Outcome text.** `describe("describeOutcome")`, three cases. **"solved"**:
  `describeOutcome("solved", 4)` returns `{ result: "Solved in 4/6", detail: null }`.
  **"out-of-guesses"**: the result names the cap and the detail explains the word was still
  possible but six guesses were not enough to narrow it down — the distinction being
  communicated is that the solver still had live candidates and simply ran out of turns (the
  `watch` case from Phase 3). **"no-candidates"**: a distinct result line and a detail
  reporting `Guesses used: {attempts}/{MAX_GUESSES}`; this is the stop the page exists to
  explain, so the wording is deliberately light ("Brain freeze! 🍧 We ran out of words!") and
  should read as a quirk of the game rather than an application error. Import `MAX_GUESSES`
  from `./constants` — **never a literal `6`**, so the cap has exactly one owner. **R6 — do
  not** respond to `no-candidates` by adding a bigger fallback dictionary or letter probing;
  explaining the stop *is* the chosen response.

### Group C — The browser loop (4.9)

- [ ] **4.9 The game loop.** Implement `play()` in `src/app/page.tsx` as a `"use client"`
  component using `useReducer(gameReducer, initialGameState)`:
  1. Generate the seed **once**: `Math.floor(Math.random() * 1_000_000_000)` — within the
     route's accepted range, one value per game. **R12 — do not** generate a seed per guess or
     omit it; the same seed identifies one game, and without it the API changes the word on
     every call.
  2. `dispatch({ type: "start", seed })`.
  3. Define a local `guessFn(word)` closing over the seed and a guess counter: it awaits the
     pause when not the first guess, increments the counter, dispatches `attempt`, awaits
     `postGuess(word, seed)`, dispatches `row`, and returns the feedback. This is the injected
     `GuessFn` the solver accepts — the browser-side half of the dependency inversion that
     made every solver test offline.
  4. `const { solve } = await import("../lib/solver")`, **after** the `start` dispatch so the
     UI shows `playing` while the chunk loads.
  5. `await solve(guessFn)`, then `dispatch({ type: "finish", reason: result.reason })`.
  6. Catch anything thrown and `dispatch({ type: "fail", message })` using
     `err instanceof Error ? err.message : "Something went wrong"`, so the route's and
     client's wording reaches the viewer unaltered.

  Add `const PAUSE_MS = 600;` at module scope, awaited inside `guessFn` **only when the guess
  counter is greater than zero**, so the first guess appears immediately. Pausing *before* the
  request rather than after keeps each row on screen for a full interval regardless of
  upstream latency. **R11 — do not** move the loop to the server. **Do not** add a cancel
  button or an abort path — out of scope, and the reducer's ignored-transition rule already
  makes a late dispatch harmless. **Keep the component thin**: no scoring, no validation, no
  error mapping in the page.

## Refactor

`src/app/page.tsx` moves from the Phase 1 placeholder to a real client component. Nothing
else is rewritten. The reducer and outcome modules are new.

## Tests After

None added here. Phase 5's bundle-boundary case is the fitness test that covers this phase's
output (the dynamic import and the type-only imports in `game-state.ts` and `outcome.ts`),
and it is written at the start of Phase 5 before the page markup exists.

## Success Criteria

- [ ] `tests/game-state.test.ts` and `tests/outcome.test.ts` green.
- [ ] `npx tsc --noEmit` clean, and the `never` guard was observed failing on a temporary
      extra `GameAction` variant before being reverted.
- [ ] `game-state.ts` and `outcome.ts` import solver types with `import type` only.
- [ ] No literal `6` appears in `outcome.ts`.
- [ ] The page contains no scoring, validation or error-mapping logic.

## Verification

```sh
npx vitest run tests/game-state.test.ts tests/outcome.test.ts
npx tsc --noEmit
npm test
```

## Risk Assessment

| Risk | Mitigation |
|---|---|
| In-place mutation | Passes the behavioural cases and breaks rendering; 4.6 is the guard |
| A bare `default: return state` | Silently absorbs an unhandled variant and loses exhaustiveness; 4.7 requires the `never` guard and a verified failure |
| A literal `6` in `outcome.ts` | Quietly forks the cap away from `constants.ts` |
| Making invalid transitions throw | The page has no cancel button, so late dispatches are normal and must be inert |
| The loop drifting thicker | Scoring, validation or error mapping in the page is logic outside the tested core |
| Pausing before the first guess | Adds 600 ms of apparent dead time on click |

## Security Considerations

The seed is generated client-side and is not a secret; it is displayed deliberately so a
viewer can reproduce a game. No credentials or user data pass through this layer.

## Rollback

Delete both modules and both tests; revert `src/app/page.tsx` to the Phase 1 placeholder. The
library layer stays green and complete.

## Next Steps

Phase 5 renders the board around this loop and locks the dynamic import with a fitness test.
