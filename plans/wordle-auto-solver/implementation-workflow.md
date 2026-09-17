---
title: 'Wordle Auto-Solver — Beginner Implementation Workflow'
description: 'A step-by-step guide for implementing the Wordle auto-solver from an empty repository.'
status: active
created: 2026-09-16
---

# Beginner Implementation Workflow

This guide explains how to implement the project from the current documentation-only tree. It is a companion to the detailed phase files, not a replacement for their exact assertions and contracts. At the time of writing, this directory has no Git repository, `package.json`, `src/`, or `tests/`.

## What You Are Building and Why

Build a Next.js and TypeScript page that automatically plays Votee's seeded, five-letter `/random` puzzle. A visitor clicks **Solve** and watches each guess and its feedback arrive, with a six-guess limit. The browser owns the solver and game state; a small server route validates and relays one guess at a time. Tests use injected feedback and stubbed network calls, so the solver can be measured offline.

The task exists to make the solver **watchable, deterministic, and reproducible**. One seed must identify one game; feedback scoring must match Votee's observed rule, including repeated letters; exact word lists and tie breaks must reproduce the measured solve rates. The boundaries also keep the large dictionaries out of the initial browser bundle and prevent malformed API replies from reaching the game state. See [overview](../../docs/overview.md), [architecture](../../docs/architecture.md), [decisions](../../docs/decisions.md), and [benchmarks](../../docs/benchmarks.md) for the evidence and rationale.

The outcome is limited to the documented `/random` flow. Preserve the known `no-candidates` and `out-of-guesses` cases. Do not add manual play, other endpoints, a database, or automated browser tests; [the plan's scope](plan.md#2-scope-boundaries) excludes them.

Use each document for a different purpose:

- [`docs/`](../../docs/) explains the product, architecture, operations, and reasons behind decisions.
- [`spec.md`](spec.md) defines exact function signatures, behavior, error messages, and edge cases.
- [`pinned-data.md`](pinned-data.md) contains literal API data, word lists, checksums, and expected solver results.
- The six phase files, starting with [`phase-01-api-client.md`](phase-01-api-client.md), contain the detailed task checklists.
- [`plan.md`](plan.md) is the high-level execution index.

Do not invent a different behavior when a document already defines it. If something is unclear, check the source-of-truth mapping in [`plan.md`](plan.md#source-of-truth-mapping).

## How To Work On Every Task

Each implementation task follows the same loop:

1. Read the task and its linked specification.
2. Write the smallest test for the behavior.
3. Run the test and confirm that it fails for the expected reason.
4. Implement only enough code to make that test pass.
5. Run the focused test again.
6. Run the phase regression tests.
7. Commit when the phase checkpoint is green.

**Why:** This is test-driven development. The failing test proves that the test can detect the missing behavior. The small implementation keeps the cause of a failure easy to understand.

Prefer one small task at a time. Do not implement several unrelated modules before running tests; otherwise a failure will be harder to locate.

## Before Writing Code

### 1. Confirm the repository state

From the project root, verify that the repository contains the planning and documentation files but no application source yet:

```sh
pwd
find . -maxdepth 2 -type f | sort
```

**Why:** The plan assumes an empty application tree. Knowing the starting state prevents accidentally overwriting existing work or following instructions that no longer apply.

### 2. Read the project rules

Read these first:

- [`docs/overview.md`](../../docs/overview.md)
- [`docs/architecture.md`](../../docs/architecture.md)
- [`docs/decisions.md`](../../docs/decisions.md)
- [`docs/operations.md`](../../docs/operations.md)
- [`docs/technical-analysis.md`](../../docs/technical-analysis.md)
- [`spec.md`](spec.md)

**Why:** These files answer different questions. The overview explains what to build, the architecture explains where code belongs, the decisions explain why alternatives were rejected, and the spec gives exact contracts.

### 3. Use the accepted scope

The plan records open observations about `Origin` checking, rate-limit key length, and old plan directories. None blocks this build. Follow the current route contract and documented limiter; do not add those possible changes or move old plans as part of this implementation. If a later decision changes the contract, update the authoritative docs and affected tests deliberately.

**Why:** The guide must not turn an unresolved observation into a new feature or a precondition for the scaffold.

## Stage 0: Build The Shared Foundation

Stage 0 must be completed before parallel work begins.

### 4. Initialize Git

From the repository root:

```sh
git init
git branch -M main
git add docs/*.md plans/wordle-auto-solver/*.md
git commit -m "docs: add solver plan and project documentation"
git status
```

If a GitHub repository is available, connect its URL and push `main` as required by [Stage 0](plan.md#4-stage-0--shared-base): `git remote add origin <repository-url>` followed by `git push -u origin main`. A local commit is sufficient to create the later worktrees; do not block coding on a missing remote URL.

**Why:** Git gives you checkpoints and lets separate worktrees share one known starting point. The `main` branch also matches the plan.

### 5. Create the project scaffold

Create the Next.js and TypeScript foundation described in [Phase 1, Group A](phase-01-api-client.md). Add:

- `package.json`
- `tsconfig.json`
- `next.config.ts`
- `eslint.config.mjs`
- `.gitignore`
- `.env.example`
- basic files under `src/app/`
- Vitest as a development dependency

Do not add a `vitest.config.ts`, path aliases, or a CSP.

Run:

```sh
npm install
npx tsc --noEmit
npm run build
```

**Why:** The scaffold is the shared substrate. Every later phase depends on the same TypeScript settings, package scripts, and test runner. The early build catches setup errors before application code is added.

### 6. Add the first boundary tests

After proving `npm test` runs with one trivial test, replace it with the boundary tests for:

- no source or test import uses the `@/` alias;
- no Vitest configuration file exists.

Run:

```sh
npm test
```

**Why:** These tests protect a deliberate project constraint. Relative imports keep the setup simple and avoid making Next.js and Vitest resolve modules differently.

### 7. Add constants and configuration

Write `tests/config.test.ts` first, run `npx vitest run tests/config.test.ts`, and confirm the missing exports cause the expected red result. Then implement and test:

- `MAX_GUESSES = 6`;
- `VALID_RESULTS`;
- `voteeApiUrl(env)` with its default, blank, valid override, and invalid URL cases.

Use the API host from [`pinned-data.md`](pinned-data.md#stage-0--default_votee_api_url).

**Why:** Constants need one owner so the solver, route, and UI cannot disagree. Configuration must be optional so a fresh clone works without a `.env` file.

### 8. Add the initial solver types

Create `src/lib/solver.ts` with only the type definitions listed in [`spec.md §1`](spec.md#1-module-contracts). Do not implement scoring or solving yet.

Run:

```sh
npm test
npx tsc --noEmit
```

Then commit Stage 0, including `package-lock.json`:

```sh
git add package.json package-lock.json tsconfig.json next.config.ts eslint.config.mjs .gitignore .env.example src tests
git commit -m "chore: create shared project foundation"
```

**Why:** The parallel phases need shared types and constants. Committing now gives every worktree the same starting point and prevents duplicate definitions.

## Run Three Worktrees In Parallel

Start this section only after the Stage 0 commit exists. The three worktrees branch from
that commit and work on separate files:

| Worktree | Work                 | Ownership                                                   |
| -------- | -------------------- | ----------------------------------------------------------- |
| A        | Phase 1 API client   | Votee adapter, limiter, route, browser transport, and tests |
| B        | Phases 2 and 3       | Word lists, solver implementation, and solver tests         |
| C        | Phase 4 pure modules | `game-state.ts`, `outcome.ts`, and tests                    |

From the repository root, invoke the AgentKit `ak:worktree` skill three times in
your agent chat (these are skill prompts, not shell commands):

```text
/ak:worktree Create a worktree from main. Use the exact branch name phase-api (no prefix) and worktree root ..
/ak:worktree Create a worktree from main. Use the exact branch name phase-solver (no prefix) and worktree root ..
/ak:worktree Create a worktree from main. Use the exact branch name phase-state (no prefix) and worktree root ..
```

The skill's `--no-prefix` mode preserves these branch names, so the merge
commands below still apply. With `..` as the worktree root, it creates
`../wordle-trial-phase-api`, `../wordle-trial-phase-solver`, and
`../wordle-trial-phase-state`. Check each reported branch, base, and path before
starting work so an unexpected prefix or location is caught immediately.

If AgentKit is unavailable or cannot create a worktree, run the equivalent Git
commands from the repository root instead. Use these only for worktrees that the
skill did not already create:

```sh
git worktree add -b phase-api ../wordle-trial-phase-api main
git worktree add -b phase-solver ../wordle-trial-phase-solver main
git worktree add -b phase-state ../wordle-trial-phase-state main
```

Run the workstreams at the same time, each in its own terminal. A single builder can instead execute A, then B, then C on `main`; the same phase checkpoints apply:

- **Worktree A:** follow Phase 1 until its API, route, and browser-transport regression gate is green.
- **Worktree B:** follow Phase 2, then Phase 3. These phases share `solver.ts` and `solver.test.ts`, so they stay with one owner.
- **Worktree C:** follow the reducer and outcome tasks in Phase 4. Do not edit `page.tsx` here; the page is completed after integration.

Each worktree follows the test-first loop above. Do not let two worktrees edit the same
file. The phase files define the exact file ownership and test commands.

**Why:** Parallel work reduces waiting while clear ownership prevents conflicting edits. A
shared commit gives every worktree the same package setup, constants, and types. The phases
cannot safely start from the empty repository because they need that shared foundation.

## Merge The Parallel Work

When A, B, and C each pass their regression gate, commit each branch. Return to the main worktree and merge each branch in turn:

```sh
git checkout main
git merge --no-ff phase-api
git merge --no-ff phase-solver
git merge --no-ff phase-state
git worktree list
```

Only the first branch could fast-forward: the three branches share a base and diverge. If a merge reports conflicts, inspect `git status` and the conflicting files, reconcile the intended contracts, then run the integration checks before continuing. Do not discard another branch's tests or edits to make a merge finish. Run:

```sh
npm test
npx tsc --noEmit
npm run lint
```

Only after this check should one serial owner continue with the browser loop and interface.

**Why:** Each branch can pass alone but still fail together because of imports or shared
contracts. The integration run catches those problems before UI work adds more complexity.

## Phase 1: API Client

Follow [`phase-01-api-client.md`](phase-01-api-client.md).

### 9. Create network and route tests first

Write tests for:

- the Votee request URL, query parameters, timeout, and cache behavior;
- unordered and malformed upstream responses;
- typed HTTP errors;
- rate-limit counting, expiry, eviction, and client IP extraction;
- route validation and error mapping;
- browser transport validation.

Use a fake `fetch` implementation and the shared slot fixture.

**Why:** Network tests must be deterministic and fast. Stubbing `fetch` proves your code handles known responses without depending on Votee availability.

### 10. Implement the Votee adapter

Implement `guessRandom` so it:

1. validates the upstream response;
2. sorts slots by position;
3. returns normalized feedback;
4. throws a typed error for non-2xx responses;
5. applies the 10-second timeout.

Run the focused adapter tests before continuing.

**Why:** The adapter isolates Votee's unusual response format from the rest of the application. The solver should receive one stable feedback shape, not raw upstream data.

### 11. Implement the rate limiter

Implement the limiter as a factory with:

- a request limit and time window;
- remaining-request counts;
- a retry countdown;
- bounded key storage;
- expired-window and oldest-key eviction.

Run the rate-limit tests.

**Why:** A factory gives each test an isolated limiter. The limit protects the public proxy from accidental loops and simple abuse without adding an external database.

### 12. Implement the route and browser client

Implement `POST /api/guess` in this order:

1. identify the client and apply the rate limit;
2. parse the request;
3. validate `word` and `seed`;
4. call the Votee adapter;
5. map errors to the documented safe client messages.

Then implement `postGuess` and its independent response validation.

Run:

```sh
npx vitest run tests/config.test.ts tests/votee-api.test.ts tests/rate-limit.test.ts tests/guess-route.test.ts tests/guess-client.test.ts
```

**Why:** Rate limiting must happen before parsing, and the server must not expose upstream error bodies. Independent validation at both hops prevents malformed data from moving deeper into the system.

Checkpoint:

```sh
npm test
npx tsc --noEmit
npm run lint
```

## Phase 2: Filtering Engine

Follow [`phase-02-filtering-engine.md`](phase-02-filtering-engine.md).

### 13. Add the pinned word lists

Write the word-list tests before copying the data. Then add both lists exactly as shown in [`pinned-data.md`](pinned-data.md#phase-2--word-lists), including their headers.

Test:

- length;
- five lowercase letters;
- first and last entries;
- duplicates;
- checksums;
- overlap between lists.

**Why:** The solver's measured quality depends on the exact data. Checksums catch accidental edits, sorting, duplicates, or copying the wrong revision.

### 14. Implement Votee-compatible scoring

Implement the single-pass scoring rule from [`spec.md`](spec.md#2-behavioural-contracts). Add the documented repeated-letter test before implementation.

Then implement the private integer codec used for filtering.

**Why:** This API does not use standard two-pass Wordle scoring. Matching the upstream exactly is necessary; otherwise the solver can eliminate the real answer.

### 15. Implement candidate filtering and pool selection

Implement filtering so candidates are retained when their hypothetical feedback exactly matches the API feedback. Keep the full survivor list, while preferring answer-list words only when choosing the next guess.

Run the explicit mixed-list tests before continuing.

**Why:** Separating the retained candidates from the preferred guessing pool preserves allowed-guesses-only answers. Destructively narrowing the survivors causes subtle failures later.

Checkpoint:

```sh
npx vitest run tests/word-lists.test.ts tests/solver.test.ts
npm test
```

## Phase 3: Solver

Follow [`phase-03-solver.md`](phase-03-solver.md).

### 16. Implement the solver loop

Start with tests for:

- the fixed first guess `crane`;
- a solved game;
- `no-candidates`;
- `out-of-guesses`;
- the six-guess maximum.

Implement the loop with the injected `GuessFn`. Do not call `fetch` from the solver.

**Why:** Dependency injection makes the solver a pure, offline-testable component. The solver should decide guesses, while the browser or test supplies feedback.

### 17. Implement next-guess selection

Add the distinct-feedback-pattern heuristic and the strict `>` tie-break. Use the small hand-checkable word list from the phase test before running the large benchmark.

**Why:** The small test explains exactly why one guess wins. The strict tie-break preserves deterministic games and the pinned sequences.

### 18. Run the solver fitness tests

Run the exact answer-list and allowed-guesses benchmarks:

```sh
npx vitest run tests/solver.test.ts
npm test
```

Confirm the expected counts and sequences in [`docs/benchmarks.md`](../../docs/benchmarks.md) and [`pinned-data.md`](pinned-data.md).

**Why:** A solver can pass simple examples while still using the wrong argument order, wrong pool, or wrong tie-break. The full benchmark catches those subtle defects.

## Phase 4: Game Loop

Follow [`phase-04-game-loop.md`](phase-04-game-loop.md).

### 19. Implement the reducer

Write tests for starting, progressing, finishing, failing, restarting, ignoring invalid actions, and avoiding mutation. Then implement `gameReducer` with immutable updates and an exhaustiveness guard.

**Why:** The reducer is the page's state machine. Immutable updates are required for React to notice changes, and ignored invalid actions make late asynchronous responses harmless.

### 20. Implement outcome text

Write tests for all three stop reasons, then implement `describeOutcome` using `MAX_GUESSES` rather than a second literal.

**Why:** Keeping outcome wording in one pure function prevents UI code from mixing display text with game logic and keeps the guess cap centralized.

### 21. Implement the browser loop

In `page.tsx`:

1. generate one seed per game;
2. dispatch `start`;
3. dynamically import the solver;
4. pause 600 ms before guesses after the first;
5. call `postGuess` through an injected guess function;
6. dispatch rows and terminal states.

Do not add scoring or API validation to the page.

**Why:** The browser owns the watchable game experience, while the tested modules own the logic. Dynamic import keeps the large dictionaries out of the initial bundle.

Checkpoint:

```sh
npx vitest run tests/game-state.test.ts tests/outcome.test.ts
npx tsc --noEmit
npm test
```

## Phase 5: Interface

Follow [`phase-05-interface.md`](phase-05-interface.md).

### 22. Add the bundle-boundary test before markup

Test that the page reaches the solver dynamically and that type-only imports remain type-only.

**Why:** A source import can pull approximately 13,000 words into the initial browser bundle. Testing the boundary before adding UI prevents an easy accidental regression.

### 23. Build the page interface

Add:

- Solve button and disabled playing state;
- visible seed;
- progress and error messages;
- padded six-row board;
- feedback classes and accessible tile labels;
- live regions;
- CSS Module styles and global layout styles.

**Why:** These controls make the solver observable and usable. Accessible labels and live regions ensure feedback is available beyond tile colors and visual scanning.

### 24. Build and manually verify the app

Run:

```sh
npm run build
npm run dev
```

Check a solved game, a no-candidates result, an error, a restart, and rate limiting as described in the phase file.

**Why:** Automated unit tests cannot prove the complete click-to-render experience. Manual verification is intentionally the project boundary for UI testing.

## Phase 6: Hardening

Follow [`phase-06-hardening.md`](phase-06-hardening.md).

### 25. Run the complete verification gate

Run in order:

```sh
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Then verify a clean clone works without `.env` and that tests run without network access.

After committing the finished implementation, use a new directory for the clean-clone gate:

```sh
git clone . ../wordle-trial-clean-check
cd ../wordle-trial-clean-check
npm install
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Confirm the clone contains no `.env` file. Run the offline suite with network access disabled by your test environment; all API calls in tests must be stubbed. Return to the project root before continuing. Use a different empty path if `../wordle-trial-clean-check` already exists.

**Why:** Different commands catch different classes of problems: behavior, types, style rules, and production bundling. The clean-clone check verifies the project is reproducible.

### 26. Audit architecture and scope

Confirm:

- only `votee-api.ts` calls server `fetch`;
- the solver and word lists are lazy-loaded;
- answer-list-first behavior remains intact;
- all three stop reasons are tested;
- exact benchmark anchors match;
- no rejected alternative or out-of-scope feature was added.

**Why:** A green test suite can still miss an architectural regression or an accidental scope expansion. This audit checks the design constraints directly.

### 27. Review the final tree

Check the status and inspect the diff:

```sh
git status
git diff --check
git diff --stat
```

Make sure no `.env`, credentials, generated build output, or unrelated files are committed.

**Why:** This is the final hygiene check before sharing the project. It catches whitespace errors, accidental files, and secrets that functional tests do not detect.

## What To Do When A Test Fails

1. Read the first error, not the last summary line.
2. Identify which contract the test is enforcing.
3. Read the linked phase task and source-of-truth document.
4. Reproduce the failure with the narrowest test command.
5. Fix the implementation, not the test, unless the specification itself changed.
6. Re-run the same focused test.
7. Run the broader phase suite only after the focused test passes.

Do not loosen benchmark thresholds or delete boundary tests to make the suite green. A failure usually indicates a wrong data revision, argument order, tie-break, import type, or boundary placement.

Use the failure's location to narrow the diagnosis:

| Failure | Check first | Focused command |
| --- | --- | --- |
| Install, TypeScript, or build fails in Stage 0 | Node is at least 20.9, package scripts exist, imports are relative, and no generated file was committed | `node --version`; `npx tsc --noEmit`; `npm run build` |
| Adapter or route test fails | Request URL and seed, 10 s timeout, slot sorting, independent validation, exact error mapping, and whether rate limiting runs before parsing | `npx vitest run tests/votee-api.test.ts tests/guess-route.test.ts` |
| Limiter test fails | Fixed-window time arithmetic, `Retry-After`, isolated test IPs, expired-entry cleanup, and oldest-key eviction | `npx vitest run tests/rate-limit.test.ts` |
| Word-list checksum fails | Pinned revision, exact order and spacing, missing or duplicate entries; never update the checksum to fit accidental data | `npx vitest run tests/word-lists.test.ts` |
| Scoring or benchmark fails | Votee's naive repeated-letter rule, feedback-code argument order, full survivor set, answer-list-first pool, and strict `>` tie break | `npx vitest run tests/solver.test.ts` |
| Reducer or page fails | Immutable rows, legal transitions, `import type` for solver types, one seed per game, and the dynamic import after `start` | `npx vitest run tests/game-state.test.ts tests/outcome.test.ts tests/bundle-boundaries.test.ts`; `npx tsc --noEmit` |
| Manual page check fails | Browser console, `/api/guess` request and response, server output, seed shown on the page, and whether the 600 ms pause occurs before later requests | `npm run dev` |

If a red test fails because the test itself cannot load or compile, repair its setup before implementing the feature. The expected red state is a clear assertion about missing behavior. For a benchmark mismatch, reproduce a single pinned sequence before rerunning thousands of answers. For a network failure in the offline suite, find the un-stubbed `fetch` call rather than retrying the test against the live API.

## Phase Checkpoints At A Glance

| Checkpoint | Implemented | Tests written before implementation | Gate to leave the checkpoint |
| --- | --- | --- | --- |
| Stage 0 | Git base, Next.js scaffold, runner, constants, config, type-only solver contract | Relative-import and no-config boundaries; constants and config cases | `npm test`, `npx tsc --noEmit`, `npm run build`; commit shared base |
| Phase 1 | Votee adapter, bounded limiter, route, browser transport | Request, reply, timeout, limiter, route-validation, and transport cases | Focused Phase 1 tests, `npm test`, typecheck, lint, build |
| Phase 2 | Pinned lists, feedback scoring and encoding, candidate and guess pools | List shape/checksum, repeated-letter scoring, filtering and mixed-list cases | Word-list and solver tests, then `npm test` |
| Phase 3 | Injected solver loop and deterministic next-guess heuristic | Win, stop reasons, small partition example, exact sequences and fitness benchmarks | `npm test`; exact `2305/8188` and `943/4411` anchors |
| Phase 4 | Immutable reducer, outcome text, browser game loop | State transitions, mutation guard, outcomes; typecheck exhaustiveness guard | Reducer and outcome tests, typecheck, full suite |
| Phase 5 | Page controls, board, styles, accessibility, lazy bundle | Type-only and dynamic-import boundary case | Full suite, typecheck, lint, build, five hand checks |
| Phase 6 | Server-network boundary and clean-clone audits | `fetch` boundary case | Offline tests; clean-clone install, test, typecheck, lint, build; scope audit |

At every checkpoint, record the actual command result and fix failures before moving on. The [phase files](plan.md#5-phases-dependencies-and-ownership) contain the precise cases and regression commands.

## Final Completion Checklist

The implementation is complete when:

- [ ] `npm install`, `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build` pass in a clean clone with no `.env`.
- [ ] The test suite passes with networking disabled, and each architecture boundary has its named passing test.
- [ ] The answer-list benchmark solves `2305/2315` with `8188` guesses over solved games; the allowed-guesses sample solves `943/1066` with `4411` guesses.
- [ ] The pinned `quack` and `sioux` guess sequences match, and `watch` stops after six guesses.
- [ ] `solved`, `no-candidates`, and `out-of-guesses` are all reachable and tested.
- [ ] The solver and word lists load in a separate chunk, outside the route's initial JavaScript.
- [ ] All five [manual interface checks](phase-05-interface.md#tasks--steps) have recorded results; mark the live `sioux` check inconclusive if Votee changes its seed mapping.
- [ ] The reducer exhaustiveness guard was observed failing for a temporary unhandled action and then restored.
- [ ] No rejected alternative or out-of-scope feature was added; no secrets, `.env`, `.next`, or unrelated files are committed.
