---
title: "Wordle Auto-Solver — Build from docs under TDD"
description: "Execution index for the Votee /random Wordle auto-solver, built test-first with docs/ as the authoritative specification."
status: todo
priority: P1
effort: 3d
branch: main
tags: [feature, frontend, backend, api, testing]
blockedBy: []
blocks: []
created: 2026-09-16
---

# Wordle Auto-Solver — Execution Index

This file is the **execution index**: what we are building, in what order, who owns what,
and how we know it is done. It deliberately holds no requirements, architecture,
algorithms, decisions or rationale — those live in [`docs/`](../../docs/) and
[spec.md](spec.md). See [Source-of-truth mapping](#source-of-truth-mapping).

## Status

**Nothing is built yet.** : the repository contains `docs/` and this
plan directory only. There is no git repository, no `package.json`, no `src/` and no
`tests/`.

This settles the previously unresolved gate in the red-team review. Findings #1 and #7
claimed `src/`, 14 commits and 115 passing tests already existed; that is **false for this
tree**. Consequently every "Red: X does not exist" instruction in the phase files is valid
as written, and Phase 6's clean-clone check is meaningful. The plan is unblocked.

| Stage / Phase | Status |
|---|---|
| Stage 0 — shared base | Pending |
| Phases 1–4 | Pending |
| Phases 5–6 | Pending |

---

## 1. Outcome

A deterministic, watchable auto-solver: a Next.js + TypeScript page that plays Votee's
`/random` five-letter puzzle on its own and wins within six guesses for nearly every word.
Clicking **Solve** starts a game the viewer watches row by row.

Architecture boundaries are enforced by tests rather than by convention, and solver quality
is measured offline. The browser owns the game loop and the game state; the server owns
exactly one thing, relaying a single guess to Votee.

Full description: [overview.md](../../docs/overview.md#purpose) and
[architecture.md](../../docs/architecture.md#game-flow).

---

## 2. Scope Boundaries

**In scope:** 5-letter words, the `/random` endpoint with a seed, a watchable browser game,
and an offline test suite with a stubbed API.

**Out of scope — do not expand.** Restated here because a builder mid-phase will be tempted
by several of these. None may be added while executing this plan
([overview.md](../../docs/overview.md#scope)):

- Other word sizes; the `/daily` and `/word/{word}` endpoints.
- A manual play mode, a cancel button, a database, server-side streaming.
- Automated UI or browser tests — the page is checked by hand.
- A shared rate-limit store, a Content-Security-Policy with nonces, analytics or error
  tracking.
- Any item from technical-analysis.md's
  ["Recommended evolution"](../../docs/technical-analysis.md#recommended-evolution) list.
  That list describes future options, not this rebuild's scope.

The eighteen rejected alternatives that a rebuilder could plausibly re-derive are registered
in [spec.md §6](spec.md#6-rejected--do-not-reintroduce). Each is cited by the phase task
where the temptation arises.

**Accepted limitations — preserve, do not fix**
([overview.md](../../docs/overview.md#known-limitations)):

- A word the API picks that is in neither bundled list can never be solved. The solver ends
  with `no-candidates` instead of throwing. `sioux` (seed `143462397`) is the confirmed
  example.
- A few answer-list words are still lost to the chosen strategy. `watch` is the pinned
  `out-of-guesses` case.

---

## 3. Conventions for Every Phase

- **Test first, always.** Write the test, run it, see it fail for the stated reason, then
  write the minimal implementation, then re-run. A step that says "implement" without a
  preceding failing test is a plan defect.
- **Carve-out for private helpers.** A step may implement a private helper with no
  dedicated test when that helper is exercised entirely through a public-contract test in
  the same phase or in a later, explicitly named one. A step that implements without a test
  and *cannot* name that later step is still a defect.
- **Relative imports only.** No `@/` alias anywhere in `src/` or `tests/`. This is what
  makes running with no `vitest.config.ts` possible, and a test asserts that file's absence.
- **Tests mirror `src/`** under `tests/`, with shared fixtures in `tests/helpers/`.
- **No plan identifiers in code.** Task numbers, phase numbers, boundary labels and R-numbers
  stay in this plan and in `spec.md`; test names describe behaviour.
- **Rationale comes from `docs/`.** Where a step could go either way, cite the decision that
  settles it.

Task numbers (1.1, 2.7, 3.10 …) are plan coordinates used by
[spec.md §5](spec.md#5-boundary-traceability) and
[spec.md §6](spec.md#6-rejected--do-not-reintroduce). They must never appear in code, test
names, commit messages or comments.

---

## 4. Stage 0 — Shared Base

**Serial. One owner. Must complete before any parallel phase starts.**

Stage 0 exists because phases 1–4 cannot run in parallel from an empty tree. Without it,
three worktrees would each invent their own `package.json`, `tsconfig.json` and lockfile,
and each would write its own local copy of `Result` in order to compile — producing three
conflicting substrates and three sources of truth for one type, which
[R18](spec.md#6-rejected--do-not-reintroduce) forbids.

| Step | Deliverable |
|---|---|
| 0.1 | `git init` at the repository root (`wordle-trial/`), default branch `main`, initial commit. |
| 0.2 | Connect a GitHub remote and push `main`. |
| 0.3 | Phase 1 Group A (tasks 1.1–1.5): Next.js + TypeScript scaffold, `tsconfig.json`, `eslint.config.mjs`, `next.config.ts`, `package.json` with `engines >= 20.9.0`, the zero-configuration test runner, the relative-imports boundary test, the "no vitest config file exists" case, and `.env.example`. |
| 0.4 | Phase 1 tasks 1.6–1.7: `src/lib/constants.ts` (`MAX_GUESSES`, `VALID_RESULTS`). |
| 0.5 | Phase 1 task 1.8: `src/lib/config.ts` (`DEFAULT_VOTEE_API_URL`, `voteeApiUrl(env)`) with its default, blank, override and loud-failure cases. |
| 0.6 | A **types-only** `src/lib/solver.ts` carrying just the type aliases from [spec.md §1](spec.md#1-module-contracts) — `Result`, `Guess`, `StopReason`, `SolveResult`, `GuessFn` — and no implementations. |
| 0.7 | Commit the base on `main`. This commit is the branch point for all three worktrees. |

**Deviation recorded at 0.6.** Creating `solver.ts` before Phase 2 contradicts Phase 2's
"Red: `solver.ts` does not exist" step. Accepted knowingly: the alternative — a new
`src/lib/types.ts` — adds a file absent from the
[project structure](#8-project-structure) and would fail Phase 6's file-inventory audit.
Types-only is the smaller deviation. The Phase 2 agent adds `score` and the private codec
to this existing file rather than creating it.

**Note on 0.2.** `git worktree` needs only a local repository with one commit; GitHub is not
a prerequisite for the parallel phases. The remote is for backup and review. Continuous
integration and deployment remain out of scope
([operations.md](../../docs/operations.md#deployment)).

---

## 5. Phases, Dependencies and Ownership

Phases are ordered so every phase's tests can run green before the next one starts. Every
phase file carries its own goal, file inventory, numbered tasks with checkboxes, a
**Tests Before / Refactor / Tests After** breakdown, a regression gate and a rollback.

| # | Phase | Delivers | Depends on | Status |
|---|---|---|---|---|
| 1 | [API Client](./phase-01-api-client.md) | Votee adapter, rate limiter, `/api/guess` route, browser transport | Stage 0 | Pending |
| 2 | [Filtering Engine](./phase-02-filtering-engine.md) | Word lists, feedback encoding, naive scoring, candidate elimination, answer-list-first pool | Stage 0 | Pending |
| 3 | [Solver](./phase-03-solver.md) | `solve()`, the distinct-partition heuristic, stop reasons, determinism and solve-rate fitness tests | 2 | Pending |
| 4 | [Game Loop](./phase-04-game-loop.md) | `gameReducer`, `describeOutcome`, the browser game loop | 3 (loop only) | Pending |
| 5 | [Interface](./phase-05-interface.md) | Bundle boundary, dynamic solver import, board rendering, styling, hand verification | 4 | Pending |
| 6 | [Hardening](./phase-06-hardening.md) | Clean-clone checks, server-network fitness test, boundary / rejected-alternative / scope audits, deployment readiness | 5 | Pending |

Scaffolding tasks 1.1–1.8 move to Stage 0; Phase 1 as executed begins at task 1.9.

### Parallel execution

Three worktrees branch from the Stage 0 commit. File ownership is disjoint, so no file is
touched twice and the merge is a fast-forward of unrelated paths rather than a conflict
resolution exercise.

| Worktree | Scope | Sole owner of |
|---|---|---|
| A | Phase 1, groups B–F (tasks 1.9–1.29) | `votee-api.ts`, `rate-limit.ts`, `app/api/guess/route.ts`, `guess-client.ts`, `tests/helpers/slots.ts` and their tests |
| B | Phases 2 and 3 | `words.ts`, `allowed-guesses.ts`, the `solver.ts` implementations, `solver.test.ts`, `word-lists.test.ts` |
| C | Phase 4, pure modules only (tasks 4.1–4.8) | `game-state.ts`, `outcome.ts`, `game-state.test.ts`, `outcome.test.ts` |

Phases 2 and 3 share one owner because both write `src/lib/solver.ts` and
`tests/solver.test.ts`.

Worktree C does **not** touch `page.tsx`. Phase 4's `play()` loop calls `postGuess`
(worktree A) and `solve` (worktree B), so it cannot compile in isolation, and Phase 5
rewrites the same file.

### Integration

After the three worktrees merge to `main`, a single serial owner runs the full suite and
then completes Phase 4's `play()` loop in `page.tsx`, Phase 5 and Phase 6. The loop and the
interface belong to one owner because they are the same file under the same hand-verification
gate, and because [R14](spec.md#6-rejected--do-not-reintroduce) means the only check on that
work is a human at a dev server.

**Expected speedup is well under 3×.** Worktree B generates both word lists and runs the
full benchmark under 120-second test timeouts, so its runtime sets the floor.

---

## 6. Validation Commands

No `.env` file is needed to install, run the checks, or start the app. Node version: see
`engines` in `package.json` (`>= 20.9.0`).

```sh
npm install
npm test         # vitest run — offline, no network needed
npm run lint
npx tsc --noEmit
npm run dev      # local development server
npm start
```

`npm run build` produces the production bundle and is part of the Phase 6 gate.

Per-phase regression gates live in each phase file. `npm test` must be green before the
next phase starts.

---

## 7. Definition of Done

1. `npm install && npm test && npm run build` succeed on a fresh clone with no `.env` file.
2. Every boundary in [architecture.md](../../docs/architecture.md#boundaries) is enforced by
   a named test — see [spec.md §5](spec.md#5-boundary-traceability).
3. Offline solve rates reach the figures in
   [benchmarks.md](../../docs/benchmarks.md#enforced-thresholds-and-anchors): answer list
   ≥ 99% with ≤ 3.65 average guesses over solved games, allowed-guesses sample ≥ 85%, with
   the exact anchors `2305 / 8188` and `943 / 4411` matching.
4. The three stop reasons `solved`, `out-of-guesses` and `no-candidates` are each reachable
   and each pinned by a test.
5. No rejected alternative from [spec.md §6](spec.md#6-rejected--do-not-reintroduce) has
   been silently reintroduced.
6. `npx tsc --noEmit` and `npm run lint` are clean; the exhaustiveness guard in
   `gameReducer` has been observed failing on an unhandled variant and reverted.
7. The five hand checks in Phase 5 task 5.9 have been walked against a running dev server.
8. The solver and word lists appear as a lazily loaded chunk, not in the route's first-load
   JS.
9. No out-of-scope feature from [§2](#2-scope-boundaries) is present.

---

## 8. Project Structure

```text
src/
  app/
    api/guess/route.ts      POST — limit, validate, relay, map errors
    globals.css             resets and theme variables
    layout.tsx              metadata and fonts
    page.module.css         CSS Modules for the board and controls
    page.tsx                "use client" — game loop, dynamic solver import
  lib/
    allowed-guesses.ts      ALLOWED_GUESSES (10,657), pinned gist header
    config.ts               DEFAULT_VOTEE_API_URL, voteeApiUrl(env)
    constants.ts            MAX_GUESSES, VALID_RESULTS
    game-state.ts           GameState, GameAction, gameReducer
    guess-client.ts         postGuess + independent reply validation
    outcome.ts              describeOutcome
    rate-limit.ts           createRateLimiter, clientIp
    solver.ts               score, solve, scoreCode/resultsToCode (private)
    votee-api.ts            guessRandom, VoteeHttpError — the only server fetch
    words.ts                WORDS (2,315), pinned gist header
tests/
  helpers/slots.ts          slotsReply fixture, shared by adapter and route tests
  bundle-boundaries.test.ts alias, no-config, type-only imports, server fetch
  config.test.ts            MAX_GUESSES, VALID_RESULTS, voteeApiUrl
  game-state.test.ts        reducer transitions
  guess-client.test.ts      browser transport and validation
  guess-route.test.ts       route validation, limiting, error mapping
  outcome.test.ts           outcome text
  rate-limit.test.ts        limiter mechanism and clientIp
  solver.test.ts            scoring, filtering, selection, rates, stop reasons
  votee-api.test.ts         request shape, sorting, validation, errors
  word-lists.test.ts        lengths, shapes, duplicates, checksums, overlap
.env.example                VOTEE_API_URL documented as optional
eslint.config.mjs  next.config.ts  package.json  tsconfig.json
```

---

## Source-of-Truth Mapping

Where to look for anything this index does not carry. Nothing below is duplicated here.

| Topic | Source of truth |
|---|---|
| Purpose, task interpretation, terminology, scope, known limitations | [docs/overview.md](../../docs/overview.md) |
| Architecture, ownership table, boundaries | [docs/architecture.md](../../docs/architecture.md) |
| Why any choice was made, and what was rejected | [docs/decisions.md](../../docs/decisions.md) |
| Requirements, configuration, rate limit, Votee API quirks, deployment | [docs/operations.md](../../docs/operations.md) |
| Solver algorithm, complexity, runtime workflow, design patterns, future evolution | [docs/technical-analysis.md](../../docs/technical-analysis.md) |
| Measured solve rates, enforced thresholds, exact anchors, opener and strategy benchmarks | [docs/benchmarks.md](../../docs/benchmarks.md) |
| Exported signatures and module contracts | [spec.md §1](spec.md#1-module-contracts) |
| Numbered behavioural requirements | [spec.md §2](spec.md#2-behavioural-contracts) |
| Literal error strings, route mapping, transport messages | [spec.md §3](spec.md#3-error-handling) |
| Edge-case and test inventory | [spec.md §4](spec.md#4-edge-cases) |
| Boundary → task → enforcing test | [spec.md §5](spec.md#5-boundary-traceability) |
| Rejected alternatives register (R1–R18) | [spec.md §6](spec.md#6-rejected--do-not-reintroduce) |
| Literal default API host, both word lists with gist revisions and SHA-256 checksums, pinned guess sequences | [pinned-data.md](pinned-data.md) |
| Step-by-step execution detail | the six phase files listed in [§5](#5-phases-dependencies-and-ownership) |

`docs/` is authoritative for behaviour and rationale. `spec.md` is authoritative for
implementation-exact detail that `docs/` deliberately omits. `pinned-data.md` is
authoritative for literal data blobs. Where this index and a source disagree, the source
wins and this index is the defect.

### Data reproduced from source, not `docs/`

Three areas need literal data that `docs/` deliberately omits, since it does not inline
large blobs or implementation-exact figures. That data is pinned in
[pinned-data.md](pinned-data.md), captured from a run that independently reproduced every
value, so this plan needs no external source tree.

| Needed by | See in pinned-data.md | What |
|---|---|---|
| Stage 0 | [Stage 0 — `DEFAULT_VOTEE_API_URL`](pinned-data.md#stage-0--default_votee_api_url) | The literal default-host string |
| Phase 2 | [Phase 2 — Word lists](pinned-data.md#phase-2--word-lists) | Both lists, their gist URLs and revision hashes, both SHA-256 checksums |
| Phase 3 | [Phase 3 — Determinism and solve-rate anchors](pinned-data.md#phase-3--determinism-and-solve-rate-anchors) | Guess totals `8188` / `4411` and the pinned guess sequences |

---

## 9. Retrospective — Lessons Carried Forward

- **Divergent scoring rules.** The Votee API scores yellows in a single naive pass rather
  than by Wordle's two-pass rule. Implement exactly to the API's observed behaviour, not to
  domain assumptions. See [spec.md §2](spec.md#2-behavioural-contracts) and
  [R1](spec.md#6-rejected--do-not-reintroduce).
- **Architectural boundaries need mechanical enforcement.** The dictionaries total ~13,000
  words and must stay out of the initial bundle. An accidental value-import of a type breaks
  that boundary silently, so a regex source scan guards it.
- **State machine immutability.** Mutating rows with `push()` prevents React from
  re-rendering between solver steps, and invalid actions must be ignored rather than thrown
  so a late async dispatch cannot crash the page.
- **Determinism is fragile at the tie-break.** Mishandling ties diverges from the pinned
  sequences and the exact anchors, which is the only signal that catches it.
- **TDD and fitness functions are the shield.** Writing architectural boundary tests before
  the code caught structural leaks early. Type-level constraints —
  `const _exhaustive: never = action;` — move state-machine completeness from runtime to
  compile time.

---

## Validation Log

### Session 1 — 2026-09-16

**Verification pass (Full tier, 6 phases),** run against the plan files themselves since
`src/` does not exist:

| Check | Result |
|---|---|
| Every task number cited in `plan.md` resolves to a task defined in a phase file | Verified — 48 citations, 0 dangling |
| Every relative link in `plan.md` and the six phase files resolves on disk | Verified at the time — **since invalidated**, see session 2 |
| All 18 rejected alternatives (R1–R18) are cited in at least one phase task | Verified |
| Error-message strings match the strings in the Phase 1 tasks | Verified — 7 strings, no drift |
| `ak plan validate` | Passes (exit 0); 111 tasks across 6 phases |

**Decisions confirmed with the user:**

| # | Question | Decision |
|---|---|---|
| 1 | Shape of `plan.md` — full 19-section spec, or a short index plus a separate `spec.md`? | **Superseded in session 2.** Originally: keep all 19 sections in `plan.md`. |
| 2 | Phase 1 carries 29 of 111 tasks — split, rebalance, or leave? | **Leave it.** Its labelled groups are the checkpoints. Rebalancing was rejected because moving the limiter or route out of Phase 1 breaks the dependency order. Session 2 moves only the scaffolding tasks 1.1–1.8, into Stage 0. |
| 3 | Disposition of the two superseded plan directories | **Unanswered — left in place.** `260915-rebuild-from-docs-tdd/` and `plans/260916-1007-wordle-auto-solver/` are inert; only this plan is indexed by the `ak` plan store. |

**Scope decision:** HOLD SCOPE. `--yagni` was not passed; the restructuring changed
organisation only.

### Session 2 — 2026-09-16

**Restructure.** `plan.md` reduced from a 19-section specification to this execution index.
Duplicated overview, user flow, API description, architecture, algorithm and setup sections
were replaced by links to `docs/`. Implementation-exact content was moved, not deleted:

| Moved from | To |
|---|---|
| §7 data structures | [spec.md §1](spec.md#1-module-contracts) |
| §5 functional requirements, §9 controller rules, §10 UI behaviour | [spec.md §2](spec.md#2-behavioural-contracts) |
| §11 error handling | [spec.md §3](spec.md#3-error-handling) |
| §12 edge cases | [spec.md §4](spec.md#4-edge-cases) |
| §15 boundary traceability | [spec.md §5](spec.md#5-boundary-traceability) |
| §19 rejected register (R1–R18) | [spec.md §6](spec.md#6-rejected--do-not-reintroduce) |
| §16 solver benchmark | [docs/benchmarks.md](../../docs/benchmarks.md) |

This reverses session 1's decision #1 deliberately. The two-file split keeps one
authoritative contract per kind of content rather than scattering the specification.

**Two defects found and fixed during the restructure:**

| Defect | Fix |
|---|---|
| Every `../../docs/` link in `plan.md` and all six phase files mis-resolved. The plan directory sat at `wordle-trial/wordle-auto-solver/`, so `../../docs/` pointed at an unrelated `Projects/docs/` folder. Session 1's "0 broken links" check had assumed the intended depth. | Plan directory moved to `wordle-trial/plans/wordle-auto-solver/`, which makes every existing link correct and matches the repository's plan convention. No link text was edited. |
| `phase-03-solver.md` cited `../../docs/overview.md#measured-results` twice; that anchor does not exist in `overview.md`. | Repointed to [docs/benchmarks.md#measured-results](../../docs/benchmarks.md#measured-results), created in this session. |

**Structural decisions applied:** repository root is `wordle-trial/` (both `docs/` and this
plan's relative links require it); default branch renamed from `master` to `main` in the
frontmatter, to be created in Stage 0.

**`pinned-data.md` renumbered to the current stages,** replacing the mapping note that had
let its headings keep older numbers. This also closes session 1's red-team finding #15,
which reported the file pointing at a `README.md §7` that does not exist in this structure.

| Old heading | New heading | Inbound links updated |
|---|---|---|
| `Phase 02 — DEFAULT_VOTEE_API_URL` | `Stage 0 — DEFAULT_VOTEE_API_URL` | `phase-01-api-client.md` (2) |
| `Phase 03 — Word lists` | `Phase 2 — Word lists` | `phase-02-filtering-engine.md` (2) |
| `Phase 05 — Determinism and solve-rate anchors` | `Phase 3 — Determinism and solve-rate anchors` | `phase-03-solver.md` (1) |

`Pinned checksums` is a subsection of "Phase 2 — Word lists" and was already
phase-agnostic, so its anchor is unchanged.

**Red-team gate closed.** Findings #1 and #7 — "the repository is not empty" — were verified
false for this tree. See [Status](#status).

### Carried-forward red-team findings

Findings from the session 1 review that were accepted as risk notes or remain open. The
full disposition table is not reproduced; these are the ones a builder must act on.

| Finding | Severity | Disposition |
|---|---|---|
| Task 1.24 times 30 awaited route calls against the real wall clock, with no injectable `now` | High | Accepted as a risk note. Injection rejected — it would change the route's shape. |
| No `Origin` check; a third-party page can burn a visitor's quota | Medium | **Open — needs a decision.** |
| Limiter keys are unbounded-length strings from `x-forwarded-for`; `maxKeys` bounds count, not bytes | Medium | **Open — needs a decision.** |
| `"unknown"` IP bucket becomes one global 30/min cap when no proxy sets forwarding headers | High | Accepted as a documentation note in [operations.md](../../docs/operations.md#rate-limit). Hard-fail-on-startup rejected as new scope. |
| Hand check 2 assumes Votee's seed `143462397` still selects `sioux` indefinitely | Medium | Accepted in reduced form — record as inconclusive if it drifts. |

---

## Unresolved Questions

1. The `Origin`-check and limiter-key-length findings above are still undecided. Neither
   blocks Stage 0 or the parallel phases; both touch Phase 1 task 1.25: Do not add either. Keep the current scope limited to the documented rate limiter.
2. Disposition of the two superseded plan directories (session 1, decision #3) remains
   unanswered: just the log and can be moved to archives/
