# Technical Analysis

An architectural orientation to the project, its solver algorithm, runtime
workflow, design patterns, and scaling limits. For the product scope and
terminology, start with [overview.md](overview.md). For the rationale behind
individual choices, see [decisions.md](decisions.md).

## Project and architecture

This project is a small Next.js application that automatically plays Votee's
five-letter `/random` Wordle game and renders each guess on a Wordle-style
board. The browser owns the game loop and game state; the server handles one
guess at a time and retains no game session. For the runtime-boundary diagram
and the table mapping each concern to its owning file, see
[architecture.md](architecture.md#game-flow).

The API route is a trust boundary: it owns input validation, rate limiting,
upstream configuration, reply normalization, and error mapping, keeping the
Votee host and its quirks out of the browser.

## Solver algorithm

The solver uses deterministic constraint filtering followed by a
distinct-partition heuristic. It does not use random guesses, machine learning,
or a full search over every possible six-turn game. The executable owner is
[`src/lib/solver.ts`](../src/lib/solver.ts), with regression and performance
contracts in [`tests/solver.test.ts`](../tests/solver.test.ts).

### Feedback encoding

Each letter result maps to a base-3 digit:

```text
absent  = 0
present = 1
correct = 2
```

Five positions therefore have `3^5 = 243` possible feedback patterns. The
solver encodes each pattern as an integer from `0` to `242` so candidate
comparisons use compact numeric values instead of arrays of strings.

### Candidate elimination

After each guess, the solver retains only words that would produce exactly the
feedback returned by Votee:

```text
All words
   | guess "crane"
   v
Words compatible with the returned feedback
   | next guess
   v
Smaller compatible set
   |
   `-- repeat until solved, empty, or six guesses
```

The first guess is always `crane`. After filtering, answer-list words are
preferred over allowed-guess-only words so expanding the fallback dictionary
does not change games whose answers are in the primary list. The reasons for
the opener and word-list ordering are recorded in
[decisions.md](decisions.md#first-guess-is-crane) and
[decisions.md](decisions.md#two-word-lists-answer-list-first).

### Choosing the next guess

For each word in the remaining candidate pool, the solver calculates the
feedback it would create against every other candidate and counts the number of
distinct feedback patterns. It selects the word with the largest count and
breaks ties using list order (the answer list, alphabetical, before the
allowed-guesses list).

This is a lightweight information-gain approximation. It maximizes the number
of partitions, but it does not measure their probability or balance. It is
therefore not full entropy maximization or minimax. It is also not the GoF
Strategy pattern; "next-guess strategy" refers to an algorithmic choice.

### Votee-specific scoring

Votee does not count repeated letters the way official Wordle does. A letter is
`present` whenever it appears anywhere in the answer unless it is already
`correct` in that position. The solver deliberately reproduces that behavior;
otherwise it could eliminate the real answer after receiving Votee feedback.
The decision and its pinned example are in
[decisions.md](decisions.md#the-solver-copies-the-apis-naive-scoring).

### Complexity

With `M` remaining candidates, next-guess selection compares every possible
guess with every candidate, so its cost is approximately `O(M^2 * L^2)`, where
the word length `L` is fixed at five. A game has at most six iterations.

That trade-off is suitable for the current pinned lists. A much larger
dictionary, longer words, or an unrestricted probe-word pool would move this
work beyond the current scaling envelope and could block the browser's main
thread.

## Runtime workflow

1. The user clicks **Solve** and the browser creates a seed.
2. The reducer enters the `playing` state.
3. The page dynamically imports the solver, keeping its word lists out of the
   initial page bundle.
4. The solver requests its first guess, `crane`, through an injected guess
   function.
5. The browser sends `{ word, seed }` to `POST /api/guess`.
6. The route applies its per-IP rate limit and validates the request.
7. The Votee adapter sends the guess and unchanged seed to `/random`, applies a
   timeout, validates the upstream slots, sorts them, and returns normalized
   feedback.
8. The browser validates that reply and adds the row to reducer-managed state.
9. The solver filters candidates, chooses another guess, waits for the visual
   pause, and repeats.
10. The game ends as `solved`, `out-of-guesses`, or `no-candidates`; transport
    and validation failures instead move the UI to `error`.

Each step's owning file is listed in architecture.md's
["Where to look"](architecture.md#where-to-look) table.

## Design patterns

| Pattern | Application |
|---|---|
| Functional core / imperative shell | Scoring and selection are pure calculations surrounded by React and network orchestration. |
| Function-level dependency inversion | The solver accepts a guess function, and the browser client accepts a fetch implementation, enabling offline tests without a dependency-injection framework. |
| Reducer-backed state machine | A discriminated union models `idle`, `playing`, `done`, and `error`, while invalid transitions are ignored. |
| Adapter / anti-corruption boundary | The Votee adapter converts an irregular external response into the application's stable feedback contract. |
| Backend-for-frontend proxy | `/api/guess` hides upstream configuration and owns validation, limiting, and error mapping. |
| Defensive boundary validation | The server validates Votee replies, and the browser independently validates the route response. |
| Lazy loading | The solver and bundled dictionaries load only when a game starts. |
| Architecture fitness tests | Tests protect bundle boundaries, word-list identity, deterministic sequences, and solver-quality thresholds. |

The application has some ports-and-adapters characteristics, but it is not a
formal Clean Architecture, MVC, CQRS, Repository, or Event Sourcing system.
Adding those layers would increase ceremony without addressing a current need.

## Technology guidance

The deliberately small stack is documented in [`package.json`](../package.json):
Next.js and React are the runtime framework, TypeScript defines the contracts,
and Vitest exercises the application offline. CSS Modules own page styling.

This choice provides:

- few runtime dependencies and little operational complexity;
- deterministic solver behavior that is practical to test exhaustively against
  the primary answer list;
- a narrow external-service boundary with no upstream details exposed to the
  browser; and
- clear concern ownership without service or repository boilerplate.

Its important costs and risks are:

- **Dictionary coverage:** Votee can select words absent from both bundled
  lists, making `no-candidates` an accepted correctness ceiling.
- **Browser computation:** the quadratic selection step can become a visible
  main-thread task as the candidate or guess pool grows.
- **Process-local rate limiting:** instances do not share counters, and cold
  starts reset them; the operational limits are detailed in
  [operations.md](operations.md#rate-limit).
- **Synchronous upstream dependency:** every guess requires an uncached Votee
  request, so Votee latency and availability directly affect each game.
- **Missing browser-level automation:** module and contract tests do not prove
  the entire click-to-render journey.
- **Proxy assumptions:** client-IP identification relies on trusted forwarding
  headers from the intended Vercel deployment.

## Recommended evolution

1. Treat dictionary coverage as the first product decision if live solve
   reliability must improve. This would revisit an explicitly rejected scope,
   so agree on the desired success target before changing the solver.
2. Add one browser-level test covering Solve through the terminal state, plus
   one error path.
3. Profile next-guess computation before moving it to a Web Worker or changing
   the heuristic.
4. Adopt shared or platform-level rate limiting only when multi-instance abuse
   guarantees become an actual deployment requirement.
5. Retain the current modular architecture until a measured problem justifies
   another layer.

Run `npm test` to verify the current executable contracts and solver-quality
thresholds.
