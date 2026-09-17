---
phase: 2
title: "Phase 2: Filtering Engine"
status: todo
priority: P1
effort: "4h"
dependencies: [1]
---

# Phase 2: Filtering Engine

## Goal

Bundle the two pinned word lists and build the pure mechanics the solver composes: base-3
feedback encoding, Votee's naive scoring rule, candidate elimination, and answer-list-first
pool selection.

## Context Links

- Specification: [plan.md](./plan.md) §5 (requirement 11), §7 (data structures), §8.1–§8.3
  and §8.5 (algorithm), §12 (edge cases)
- Literal word lists and checksums:
  [pinned-data.md](./pinned-data.md#phase-2--word-lists)
- Source docs:
  [decisions.md](../../docs/decisions.md#the-solver-copies-the-apis-naive-scoring),
  [decisions.md](../../docs/decisions.md#two-word-lists-answer-list-first)

## Key Insights

- **The tests come before the data**, even though the data is inert. The checksum is the
  artifact that makes "deterministic games" verifiable at all — if a list drifts, every
  solve-rate figure in Phase 3 becomes meaningless.
- Scoring must copy the API's rule, not Wordle's. Getting it "right" by Wordle's rules makes
  the solver wrong against this API.
- The answer-list filter is applied at **pick time only**. Assigning it back to the survivor
  set is a plausible-looking change that quietly breaks three later tests.

## Requirements

Functional: [plan.md](./plan.md) §5 requirements 1, 2, 4, 5 and 11.

Non-functional:

- Both lists are copied verbatim from the appendix, including header comments. No sorting,
  de-duplication or filtering — any transformation breaks the pin and the checksum.
- The lists stay out of every module the page statically imports (Phase 5 depends on it).

## Architecture

```text
WORDS (2,315) ─┐
               ├─► default pool [...WORDS, ...ALLOWED_GUESSES]
ALLOWED_GUESSES ┘          │
                           ├─► filter by scoreCode(candidate, guess) === resultsToCode(feedback)
                           └─► selectPool(survivors): answer-list subset if non-empty
```

`scoreCode` and `resultsToCode` are private; the public surface is `score()` and (in Phase
3) `solve()`.

## Files to Create / Modify

- Create: `src/lib/words.ts`, `src/lib/allowed-guesses.ts`, `src/lib/solver.ts` (partial)
- Create: `tests/word-lists.test.ts`, `tests/solver.test.ts` (partial)

## Tests Before

| Test file | Cases first red |
|---|---|
| `word-lists.test.ts` | length/shape/endpoints, duplicates, checksum (×2 lists), overlap |
| `solver.test.ts` | `apple` vs `ppppp`, `apple` vs `paper`, never-repeats, cap, three pool-selection cases |

## Tasks & Steps

### Group A — Word lists (2.1–2.5)

- [ ] **2.1 Answer list: length, shape, endpoints.** `tests/word-lists.test.ts`,
  `describe("WORDS")`, case **"has the expected length, shape and endpoints"**:
  `length === 2315`, every entry matching `/^[a-z]{5}$/`, first and last entries matching
  the source. Copy `src/lib/words.ts` **verbatim** from
  [pinned-data.md](./pinned-data.md#phase-2--word-lists), header comment (pinned raw gist
  URL including the revision hash) included.
- [ ] **2.2 No duplicates.** `new Set(WORDS).size === WORDS.length`. Red only if the
  transcription introduced a repeat; keep the case anyway — it is cheap and it catches a
  copy-paste error during a future list update, which is exactly the deliberate-change
  scenario the boundary describes.
- [ ] **2.3 Pinned checksum.** Case **"matches the pinned checksum"** computing
  `createHash("sha256").update(WORDS.join(" ")).digest("hex")` against a constant declared at
  the top of the test file. **Write the constant before running**, copied from
  [pinned-data.md](./pinned-data.md#pinned-checksums). Do not paste in whatever the code
  happens to produce — a checksum copied from the implementation pins nothing. `join(" ")`
  is order-sensitive by design, which is what makes this the determinism anchor.
- [ ] **2.4 Allowed-guesses list.** Repeat 2.1–2.3 under `describe("ALLOWED_GUESSES")`:
  length `10657`, five-lowercase-letter shape, first/last endpoints, no duplicates, and its
  own pinned SHA-256 constant. Copy `src/lib/allowed-guesses.ts` verbatim, header included.
- [ ] **2.5 The two lists do not overlap.** `describe("WORDS and ALLOWED_GUESSES")`, case
  **"do not overlap"**: build a `Set` of `WORDS` and assert no `ALLOWED_GUESSES` entry is in
  it. Red if the upstream file is the superset variant that includes the answers — an overlap
  would mean duplicate candidates, a skewed distinct-partition count and solve-rate figures
  that no longer match the documented measurements. If red, **re-pin to the disjoint
  revision** rather than subtracting the answers in code: these are pinned data, not derived
  data.

### Group B — Scoring (2.6–2.7)

- [ ] **2.6 Feedback encoding.** No exported codec — exporting one only to test it would
  widen the public surface for no product reason. Implement private `scoreCode(answer, guess)`
  returning an integer `0`–`242` with digit weights `1, 3, 9, 27, 81` for slots 0–4, plus
  `resultsToCode(results)` and the digit/result lookup tables. **The two must agree on digit
  order, or filtering silently discards every candidate.** These helpers are exercised end to
  end by 2.7's and Phase 3's public-contract tests, per the carve-out in
  [plan.md](./plan.md) §14. **R5 — do not** carry feedback as arrays of strings through
  filtering and selection: integer codes measured ~6.5× faster and play exactly the same
  games.
- [ ] **2.7 Naive Votee scoring.** `tests/solver.test.ts`, `describe("score")`. Case
  **"scores apple vs ppppp"** asserting
  `["present", "correct", "correct", "present", "present"]` — the case
  [decisions.md](../../docs/decisions.md#the-solver-copies-the-apis-naive-scoring) pins
  verbatim; any two-pass implementation fails it immediately. Case **"scores apple vs
  paper"** — a mixed case exercising `correct`, `present` and `absent` in one call,
  confirming the per-slot rule rather than a lucky uniform answer. Implement per slot `i`:
  `answer[i] === guess[i] ? 2 : answer.includes(guess[i]) ? 1 : 0`, with `score` decoding the
  integer back into a `Result[]`. **R1 — do not** implement real two-pass Wordle scoring with
  letter counts: filtering with it would discard the true answer whenever a guess repeats a
  letter more often than the answer does.

### Group C — Filtering and pool selection (2.8–2.9)

- [ ] **2.8 Candidate elimination.** Case **"never repeats a guess"**: play several answers
  through the `fakeGuess` stub and assert the guessed words in each game are all distinct.
  This is the cheapest observable proof that filtering works — a word already guessed and not
  the answer cannot survive its own feedback, so a repeat means the filter is not running or
  is comparing the wrong codes. Pair with **"never makes more than MAX_GUESSES guesses"** over
  a spread of answers. Implement
  `candidates = candidates.filter(c => scoreCode(c, word) === resultsToCode(feedback))`.
  **Argument direction matters**: score the *candidate* as the hypothetical answer against
  the *guess just played*. Reversing them produces a filter that is wrong but not obviously
  wrong. The filter's *correctness* is pinned by Phase 3's exact counts, which no
  subtly-wrong filter reproduces; that deferral is deliberate sequencing, not untested code.
- [ ] **2.9 Answer-list-first pool selection.** Three cases.
  1. **"plays answer-list words the same with the default list and an explicit WORDS list"**
     — the enforcer architecture.md names. For each of `apple`, `crane`, `zesty`, run
     `solve(fakeGuess(answer))` and `solve(fakeGuess(answer), WORDS)` and assert identical
     sequences. Red if the pool is a flat concatenation, because allowed-guesses words then
     compete in the distinct-partition count and change the picks.
  2. **"solves aster with the default word list"** — `aster` (seed `584199032`) is the live
     word that motivated bundling the second list at all; this proves the fallback is
     reachable and not dead weight.
  3. **"keeps allowed-guesses survivors after picking from the answer list"** on an explicit
     mixed list, asserting in sequence that (a) the pick comes from the answer-list subset
     when both kinds survive, and (b) after later feedback eliminates every answer-list
     survivor, an allowed-guesses-only word is still reachable and can be guessed.
     **Assertion (b) is the one that matters** — without it the case's examples are all
     answer-list words and the destructive variant below passes.

  Implement: default list `[...WORDS, ...ALLOWED_GUESSES]`, a `Set` of `WORDS` for O(1)
  membership, and `selectPool` applied **only at pick time**. **Do not write
  `candidates = selectPool(candidates)`** — narrowing the survivor set destructively discards
  every allowed-guesses-only survivor for the rest of the game, passes cases 1 and 2, and
  silently breaks `aster`, the `sioux` sequence (3.10) and the 943 / 1,066 sample (3.9). This
  case exists so that variant fails *here*, in the phase that introduces it.

## Refactor

No prior implementation to protect. The one ordering constraint: 2.6's private helpers land
before 2.7's public `score()`, and `selectPool` lands as a separate function from the
survivor-set update so the two can never be conflated.

## Tests After

`tests/word-lists.test.ts` becomes standing regression pressure: it is the pin that makes
every Phase 3 figure meaningful. Nothing in it needs re-running per change, but it must stay
green.

## Success Criteria

- [ ] `tests/word-lists.test.ts` green, with checksums that were written before the first run.
- [ ] `score("apple", "ppppp")` matches the documented naive result.
- [ ] All three pool-selection cases green, including assertion (b) of case 3.
- [ ] `src/lib/solver.ts` imports only `./words`, `./allowed-guesses` and `./constants`.
- [ ] No `fetch` stub appears anywhere in `tests/solver.test.ts`.

## Verification

```sh
npx vitest run tests/word-lists.test.ts tests/solver.test.ts
npm test
```

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Deriving a checksum from the implementation | Converts a pin into a tautology and silently removes the boundary — copy it from the appendix, never from a failing run |
| A stray sort during transcription | Fatal (the checksum is order-sensitive); editor reflow of the arrays is harmless by contrast |
| Reversed arguments in `scoreCode` | Plausible-looking; only Phase 3's solve rates catch it. Keep the order `(answer, guess)` everywhere |
| Digit-order mismatch between `scoreCode` and `resultsToCode` | Filters everything out; shows up as universal `no-candidates` |
| Reaching for real Wordle scoring out of habit | 2.7's first case fails immediately |
| Word lists leaking into a page-imported module | Phase 5's bundle boundary depends on them staying isolated |

## Security Considerations

None specific. The lists are public data; no user input reaches this layer.

## Rollback

Delete `src/lib/words.ts`, `src/lib/allowed-guesses.ts`, `src/lib/solver.ts` and both test
files. Phase 3 cannot start without them.

## Next Steps

Phase 3 builds `solve()` on top of these mechanics and pins the measured behaviour.
