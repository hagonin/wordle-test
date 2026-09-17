---
phase: 3
title: "Phase 3: Solver"
status: todo
priority: P1
effort: "6h"
dependencies: [2]
---

# Phase 3: Solver

## Goal

Complete `solve()` — the fixed opener, the distinct-partition heuristic, the shared guess
cap and the three stop reasons — then pin its measured quality and determinism with the
fitness tests that make every figure in [plan.md](./plan.md) §16 executable.

## Context Links

- Specification: [plan.md](./plan.md) §8.4–§8.5 (selection), §12 (edge cases), §16
  (benchmark), §17 (acceptance criteria 3 and 4)
- Determinism anchors:
  [pinned-data.md](./pinned-data.md#phase-3--determinism-and-solve-rate-anchors)
- Source docs: [decisions.md](../../docs/decisions.md#next-guess-strategy),
  [benchmarks.md](../../docs/benchmarks.md#measured-results),
  [overview.md](../../docs/overview.md#known-limitations)

## Key Insights

- The offline stub is the whole testing strategy in three lines. Scoring a guess against a
  known answer *is* a perfect Votee simulation, because `score` faithfully copies the API's
  rule:

  ```ts
  function fakeGuess(answer: string) {
    return (word: string) => Promise.resolve(score(answer, word));
  }
  ```

- Determinism is asserted by pinning **exact sequences**, not by running the same game twice
  — the latter passes for any memoised implementation.
- The thresholds have little slack **on purpose**: the solver is deterministic, so the rate
  moves only when the code or word lists change. A rebuilder who finds these tests "too
  strict" and loosens them has removed the mechanism, not fixed it.

## Requirements

Functional: [plan.md](./plan.md) §5 requirements 3, 6, 7, 8.

Quality (from [benchmarks.md](../../docs/benchmarks.md#measured-results), dated 2026-09-14):
answer list 2,305 of 2,315 solved (99.57%) at 3.55 average guesses; allowed-guesses sample
943 of 1,066 (88.46%).

## Architecture

The loop, in order: guess → record → win check → filter → empty check → pick → cap check.
The pick step is the only place `selectPool` runs, and the only place the heuristic runs.

## Files to Create / Modify

- Modify: `src/lib/solver.ts` (complete `solve`, export `MAX_GUESSES`)
- Modify: `tests/solver.test.ts` (extend)

## Tests Before

| Cases first red | Pins |
|---|---|
| "solves a known answer within 6 guesses, starting with crane" | the loop and the opener |
| "picks the next guess that splits the remaining candidates most" | the heuristic and the tie-break |
| four stop-reason cases | `solved`, `no-candidates`, custom lists |
| "MAX_GUESSES matches between solver and constants" | the single-owner cap |

## Tasks & Steps

### Group A — The loop (3.1–3.6)

- [ ] **3.1 A game that ends in a win.** `describe("solve")`, case **"solves a known answer
  within 6 guesses, starting with crane"**: `await solve(fakeGuess("apple"))`; assert
  `solved === true`, `guesses.length <= MAX_GUESSES`, `guesses[0].word === "crane"`, and the
  last guess is `"apple"`. Implement a minimal loop that starts at `crane`, calls the injected
  guess function, pushes `{ word, feedback }`, and returns `{ solved: true, reason: "solved",
  guesses }` when every result is `correct`, picking the **first surviving candidate** for
  now. The placeholder pick is intentionally left unpinned — 3.3 replaces and pins it.
- [ ] **3.2 The fixed opener.** Already pinned by 3.1's assertion and by 2.9's
  list-independence case. Implement `let nextWord = "crane"` before the loop — a literal, not
  a configurable option; configurability would invite **R2** back in. **R2 — do not** pick a
  random opener or a random answer-list word each game: it wins less (97.15% / 4.12 guesses)
  and would make the same seed play differently, which the tests rely on.
- [ ] **3.3 The distinct-partition heuristic.** Case **"picks the next guess that splits the
  remaining candidates most"**, with an explicit six-word list so the arithmetic is checkable
  by hand:

  ```ts
  const result = await solve(fakeGuess("quack"), [
    "crane", "aback", "black", "flack", "quack", "scald",
  ]);
  expect(result.guesses.map((g) => g.word)).toEqual(["crane", "black", "quack"]);
  ```

  Verified with a one-off script on 2026-09-14: after `crane` the five non-opener words all
  give the same feedback and all remain candidates; scored against those five, the distinct
  pattern counts are `aback` 4, `black` 5, `flack` 4, `quack` 3, `scald` 3 — so `black` is the
  unique winner. **Record that reasoning in a comment above the test.** It is the one place a
  comment earns its keep, because the expected sequence is otherwise unverifiable by a reader.
  Red under 3.1's placeholder, which picks `aback`. Implement: for each word in the pool,
  score it against every pool member, count distinct codes with a 243-entry `Uint8Array`
  seen-table, iterate in order and keep the maximum with a strict `>` comparison so the
  **first** word achieving the best count wins. A `>=` silently changes the tie-break to
  "last" and breaks determinism. **R3 — do not** widen the probe pool to every answer-list
  word; it reached 100% on a sample but made `npm test` take minutes and each browser pick up
  to half a second. **R4 — do not** fall back to "first remaining candidate". This is a
  lightweight information-gain approximation, neither entropy maximisation nor minimax — do
  not "upgrade" it to either.
- [ ] **3.4 Stop reasons.** `describe("stop reason")`, four cases: **"reports solved for a
  known answer"**; **"does not solve or throw when the answer is missing from the list"**
  (`solve(fakeGuess("zzzzz"))` resolves rather than rejecting); **"reports no-candidates when
  the answer is missing and for an all-absent fake"** (both in fewer than `MAX_GUESSES`);
  **"reports solved with a custom word list"** (`["crane", "dogma"]`). Implement: after
  filtering, `candidates.length === 0` returns `no-candidates`; a loop completing without a
  win returns `out-of-guesses`. **R6 — do not** add a bigger fallback dictionary or letter
  probing; `no-candidates` is an accepted correctness ceiling, and the page explains it
  instead (Phase 4). The `out-of-guesses` branch is pinned by 3.10, not here — tasks 3.4
  through 3.10 are one red-green cycle over the three stop reasons.
- [ ] **3.5 The shared cap.** `describe("constants")`, case **"MAX_GUESSES matches between
  solver and constants"**: import from both modules, assert both are `6` and that they are
  equal. Implement `export { MAX_GUESSES }` from the solver. Its real job is to stop a future
  edit from giving the solver a private cap that disagrees with the board's row count.
- [ ] **3.6 Confirm the network boundary by construction.** *No new test.* The whole phase ran
  green with no `fetch` stub anywhere, because `solve` only ever calls its injected `GuessFn`.
  Review `src/lib/solver.ts` and confirm it imports only `./words`, `./allowed-guesses` and
  `./constants`. Phase 6 adds the static assertion that keeps it that way.

### Group B — Fitness and benchmark (3.7–3.11)

- [ ] **3.7 Determinism through exact sequences.** Add case **"plays the same game twice for
  the same answer"** — cheap, and it catches accidental shared mutable state between calls,
  for example reassigning the module-level default word array instead of a local variable.
  The substantive determinism pins are 3.3's `quack` sequence, 3.10's `sioux` sequence and
  3.8/3.9's exact counts. *Note on the "same seed" wording in the boundary: the seed lives in
  the browser and addresses the API's secret word; offline, `fakeGuess(answer)` stands in for
  "the word this seed selects", so pinning per-answer sequences is the offline form of the
  same guarantee.*
- [ ] **3.8 Answer-list solve rate.** Case **"solves at least 99% of the word list"** with an
  explicit 120 s timeout, because it plays all 2,315 games. Declare
  `MIN_SOLVE_RATE = 0.99` and `MAX_AVERAGE_GUESSES = 3.65` as named constants at the top of
  the file. Loop every word in `WORDS`, counting solved games and total guesses over solved
  games, then assert all four: `rate >= MIN_SOLVE_RATE`;
  `averageGuesses <= MAX_AVERAGE_GUESSES`; `solved === 2305`;
  `totalGuessesForSolved === 8188`. The thresholds state the product requirement; the exact
  integers are the determinism anchor. Keeping both is deliberate. `console.log` the rate and
  average so a failing run reports the new figures directly, which is what a deliberate
  strategy change needs in order to update the numbers. Red at ~97.97% if 3.3 or 2.9 is
  missing.
- [ ] **3.9 Allowed-guesses sample.** Case **"solves at least 85% of a sample of
  allowed-guesses words"** with its own generous timeout. Sample with
  `ALLOWED_GUESSES.filter((_, i) => i % 10 === 0)` — every 10th word, 1,066 of 10,657.
  **The stride is part of the contract**: a different stride yields a different sample and a
  different count. Assert `rate >= MIN_ALLOWED_SOLVE_RATE` (0.85), `solved === 943` and
  `totalGuessesForSolved === 4411`, and log the rate. Pinning `solved` alone would let a
  variant that solves the same 943 words in a different number of guesses pass unnoticed.
- [ ] **3.10 The pinned limitations.** Case **"reports no-candidates for sioux"**:
  `reason === "no-candidates"`, `solved === false`, and the exact sequence
  `["crane", "hoist", "spoil"]`. Record the live seed `143462397` in a comment above the test
  — it is the fixture's provenance and cannot be rederived from the code. Case **"reports
  out-of-guesses for watch"**: `reason === "out-of-guesses"`, `solved === false`,
  `guesses.length === 6`. This case is what makes the third stop reason a reachable, tested
  state rather than dead code. **Do not "fix" `watch`** by changing the heuristic: the
  faster-but-complete alternative was rejected, and improving live solve reliability is a
  product decision that requires agreeing a success target first ([plan.md](./plan.md) §19).
- [ ] **3.11 Repeated-letter spot check.** Case **"solves gazer, grave, graze, patch and
  poker within 6 guesses"**: loop those five answers, asserting solved and within the cap.
  They are near-anagram clusters (`grave`/`graze`, `gazer` sharing four letters with both) —
  exactly the shape that collapses into a large same-feedback partition and stresses the
  selection step. A solver that filters correctly but chooses poorly passes 3.1–3.4 and fails
  here.

## Refactor

Task 3.3 is the only true refactor in the plan: it replaces 3.1's first-survivor placeholder
with the heuristic, under a test that fails against the placeholder. No other task rewrites
working code.

## Tests After

Tasks 3.7–3.11 are the "tests after" set: they add no behaviour and expect **no source
changes**. If one of them needs an implementation change, Group A was incomplete — diff the
behaviour rather than editing the test.

## Success Criteria

- [ ] `solved === 2305` and `totalGuessesForSolved === 8188` on the answer list; logged rate
      reads 99.57% at 3.55 average.
- [ ] `solved === 943` and `totalGuessesForSolved === 4411` on the every-10th sample; logged
      rate reads 88.46%.
- [ ] The `quack` and `sioux` sequences match exactly.
- [ ] `watch` reports `out-of-guesses` in exactly 6 guesses.
- [ ] No threshold constant was edited to obtain a green run.
- [ ] `npm test` still completes in well under a few minutes.

## Verification

```sh
npx vitest run tests/solver.test.ts
npm test
```

## Risk Assessment

| Risk | Mitigation |
|---|---|
| **Loosening a threshold to get green** | The failure mode the documented "little slack on purpose" guards against. A missed number means the implementation differs from the specification; diff the behaviour, do not move the goalposts |
| Suite runtime creeping past a few minutes | Usually a widened probe pool (**R3**) — check pool selection before reaching for test-level workarounds |
| Exact counts wrong while checksums are right | The solver differs. If both are wrong, the lists differ |
| `>=` instead of `>` in the heuristic | Flips the tie-break and breaks the pinned `quack` sequence |
| Shared mutable state between `solve()` calls | 3.7's repeat case catches it |

## Security Considerations

None specific. This phase is pure computation with no I/O and no user input.

## Rollback

`src/lib/solver.ts` and `tests/solver.test.ts` are self-contained. Deleting them leaves the
project with no executable evidence for any claim in [plan.md](./plan.md) §16; Phases 4–5
would need the exported types stubbed.

## Next Steps

Phase 4 consumes `solve`, `SolveResult` and `StopReason` — as **types only** in
`game-state.ts` and `outcome.ts`, and through a dynamic import in the page.
