# Architecture

Where things live and which boundaries must hold. Read the linked source for behaviour; this page only explains the shape. Rationale is in [decisions.md](decisions.md).

## Game flow

The browser plays the game; the server only relays one guess at a time.

```text
Browser (src/app/page.tsx)
  solver runs here ──► postGuess ──► POST /api/guess ──► guessRandom ──► Votee GET /random
                                      (one guess)                        (seed fixed per game)
```

There is no server-side notion of a game. Each `POST /api/guess` is independent, which is what lets the page pause between guesses and show rows as they arrive.

## Where to look

| Concern | Owner |
|---|---|
| Page, game loop, pause between guesses | [src/app/page.tsx](../src/app/page.tsx) |
| Page state transitions | [src/lib/game-state.ts](../src/lib/game-state.ts) `gameReducer` |
| Text shown when a game ends | [src/lib/outcome.ts](../src/lib/outcome.ts) `describeOutcome` |
| Browser call to the route and reply checks | [src/lib/guess-client.ts](../src/lib/guess-client.ts) `postGuess` |
| Request validation, rate limit, error mapping | [src/app/api/guess/route.ts](../src/app/api/guess/route.ts) `POST` |
| Per-IP limiter and client IP lookup | [src/lib/rate-limit.ts](../src/lib/rate-limit.ts) |
| Votee API call and reply validation | [src/lib/votee-api.ts](../src/lib/votee-api.ts) `guessRandom` |
| API host setting | [src/lib/config.ts](../src/lib/config.ts) `voteeApiUrl` |
| Scoring, filtering, next-guess choice | [src/lib/solver.ts](../src/lib/solver.ts) `solve`, `score` |
| Guess cap shared by solver and UI | [src/lib/constants.ts](../src/lib/constants.ts) |
| Word lists (pinned sources in file headers) | [src/lib/words.ts](../src/lib/words.ts), [src/lib/allowed-guesses.ts](../src/lib/allowed-guesses.ts) |

Tests mirror these modules under [tests/](../tests/), with a shared fixture in `tests/helpers/`.

## Boundaries

Each of these is a constraint the code relies on. Where a test enforces it, the test is named.

- **Only `votee-api.ts` touches the network on the server.** The solver is pure TypeScript with no network code; it receives a guess function, so tests drive it with a stubbed API.
- **The page never statically imports the solver or word lists.** It loads the solver with a dynamic `import()` when Solve is first clicked, so the word lists stay out of the initial page JavaScript. Enforced by `tests/bundle-boundaries.test.ts`.
- **Answer-list words always come before allowed-guesses words.** A game whose answer is in the answer list plays exactly as if the second list did not exist. Enforced by the "plays answer-list words the same with the default list and an explicit WORDS list" case in `tests/solver.test.ts`.
- **The word lists are pinned.** Their length, order and checksum are fixed by `tests/word-lists.test.ts`; changing a list is a deliberate change that updates that test.
- **Games are deterministic.** The same seed and word lists always produce the same guesses, and the offline solve totals in `tests/solver.test.ts` depend on this.
- **Replies are validated at both hops.** The server rejects malformed Votee replies, and the browser rejects malformed route replies, so neither side trusts the other's JSON.
- **Imports are relative.** Source and tests use no `@/` alias, so Vitest runs without a config file.
