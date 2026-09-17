---
title: "Wordle Auto-Solver — Implementation Contract"
description: "The implementation-exact contract the six phase files are held to: module signatures, behavioural requirements, error strings, edge cases, boundary traceability, and the rejected-alternatives register."
status: active
created: 2026-09-16
---

# Implementation Contract

This file carries the parts of the contract that [`docs/`](../../docs/) deliberately does
not: exact exported signatures, literal error strings, the edge-case inventory that each
phase's failing tests are written against, boundary traceability, and the numbered
rejected-alternatives register that the phase files cite.

**Rationale is not repeated here.** Every "why" lives in `docs/`. This file states *what*
must be true. See [plan.md](plan.md#source-of-truth-mapping) for the full mapping.

---

## 1. Module Contracts

```ts
// src/lib/constants.ts
export const MAX_GUESSES = 6;
export const VALID_RESULTS = ["correct", "present", "absent"] as const;

// src/lib/solver.ts
export type Result = "correct" | "present" | "absent";
export type Guess = { word: string; feedback: Result[] };
export type StopReason = "solved" | "out-of-guesses" | "no-candidates";
export type SolveResult = { solved: boolean; reason: StopReason; guesses: Guess[] };
export type GuessFn = (word: string) => Promise<Result[]>;
export function score(answer: string, guess: string): Result[];
export function solve(guess: GuessFn, words?: readonly string[]): Promise<SolveResult>;
export { MAX_GUESSES };

// src/lib/votee-api.ts
export class VoteeHttpError extends Error { readonly status: number; }
export function guessRandom(word: string, seed: number): Promise<Result[]>;

// src/lib/rate-limit.ts
export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };
export function createRateLimiter(options: {
  limit: number; windowMs: number; now?: () => number; maxKeys?: number; // default 10_000
}): { check(key: string): RateLimitResult };
export function clientIp(headers: Headers): string;

// src/lib/guess-client.ts
export function postGuess(word: string, seed: number, fetchImpl?: typeof fetch): Promise<Result[]>;

// src/lib/game-state.ts
export type GameState =
  | { status: "idle" }
  | { status: "playing"; seed: number; rows: Guess[]; attempt: number }
  | { status: "done"; seed: number; rows: Guess[]; reason: StopReason }
  | { status: "error"; seed: number; rows: Guess[]; message: string };
export type GameAction =
  | { type: "start"; seed: number }
  | { type: "attempt"; attempt: number }
  | { type: "row"; row: Guess }
  | { type: "finish"; reason: StopReason }
  | { type: "fail"; message: string };
export const initialGameState: GameState;
export function gameReducer(state: GameState, action: GameAction): GameState;

// src/lib/outcome.ts
export function describeOutcome(reason: StopReason, attempts: number):
  { result: string; detail: string | null };
```

**Private to the solver, with no exported codec:** `scoreCode(answer, guess)` returning an
integer `0`–`242` with digit weights `1, 3, 9, 27, 81` for slots 0–4, and a matching
`resultsToCode(results)` used when filtering against API feedback. The two must agree on
digit order, or filtering silently discards every candidate.

`describeOutcome` returns a `{ result, detail }` pair rather than a formatted string so the
page can style headline and explanation separately without parsing text.

`Result` is imported into `votee-api.ts`, `guess-client.ts`, `game-state.ts` and
`outcome.ts` **as a type only** — a value import drags the word lists into the bundle.

---

## 2. Behavioural Contracts

### Solver

1. Feedback encodes as base-3 digits: `absent = 0`, `present = 1`, `correct = 2`;
   5 positions give `3^5 = 243` patterns, held as integers `0`–`242`.
2. Scoring copies the Votee rule exactly — a letter is `present` whenever it appears
   anywhere in the answer, unless it is already `correct` in that position. No counting.
   Per slot `i`: `answer[i] === guess[i] ? 2 : answer.includes(guess[i]) ? 1 : 0`.
3. The first guess is always the literal `crane` — a constant, not a configurable option.
4. After each guess, retain only words that would produce exactly the feedback returned.
5. Among survivors, answer-list words are preferred over allowed-guess-only words.
6. Next guess = the candidate producing the most distinct feedback patterns against the
   rest of the pool, counted with a 243-entry `Uint8Array` seen-table; ties break by list
   order via a strict `>` comparison, so the **first** word achieving the best count wins.
7. At most `MAX_GUESSES` (6) iterations.
8. Three stop reasons: `solved`, `out-of-guesses`, `no-candidates`.

**Two traps that pass the obvious cases and silently break the anchors:**

- **Argument direction.** Score the *candidate* as the hypothetical answer against the
  *guess just played*:
  `candidates.filter(c => scoreCode(c, word) === resultsToCode(feedback))`. Reversing the
  arguments produces a filter that is wrong but not obviously wrong; only the solve rates
  in [benchmarks.md](../../docs/benchmarks.md) catch it. Keep the parameter order
  `(answer, guess)` everywhere.
- **Never narrow the retained set.** The retained candidate set is always the full survivor
  list carried across rounds. The answer-list filter (`selectPool`) is applied only at pick
  time and its result is never assigned back. Writing `candidates = selectPool(candidates)`
  destructively discards every allowed-guesses-only survivor for the rest of the game; it
  passes the obvious cases while silently breaking `aster`, the `sioux` sequence and the
  943 / 1,066 allowed-guesses sample.

A `>=` comparison in the tie-break silently changes it to "last", which breaks determinism
against the pinned sequences.

### Configuration

9. `MAX_GUESSES = 6` and `VALID_RESULTS` have exactly one owner (`constants.ts`).
10. `voteeApiUrl()` returns the default when `VOTEE_API_URL` is unset or blank; a valid
    http(s) override is returned with no trailing slash; anything else throws **when a
    guess is made**, not at module load. The environment source is injectable.

### Word lists

11. `WORDS` — 2,315-word alphabetical answer list. `ALLOWED_GUESSES` — 10,657-word
    allowed-guesses list. Each file's header records the pinned raw gist URL including the
    revision hash. Every entry is exactly five lowercase letters; neither list has
    duplicates; the two do not overlap; order is preserved, never re-sorted.

### Adapter

12. `guessRandom(word, seed)` issues the `/random` request with `cache: "no-store"` and a
    10 s timeout, forwards the seed unchanged, validates the reply, sorts slots by `slot`
    and returns `Result[]`.
13. Non-2xx throws a typed `VoteeHttpError` carrying the status and a truncated body
    excerpt, read as **text** — never `json()`, since `400` bodies are plain text. The
    excerpt is stripped of control characters before being logged. Structurally invalid
    200 bodies throw a plain `Error` from `invalidReply(reason)`, distinguishable from the
    HTTP error type. The distinction is load-bearing: the route keys its message choice on
    the error type.

### Rate limiter

14. 30 guesses per 60 s per client IP, in process memory per server instance.
15. `check(key)` returns `{ allowed, remaining, retryAfterSeconds }`; `retryAfterSeconds`
    counts down to the window's end and is never below 1.
16. Memory is bounded by `maxKeys` (finite default `10_000`); eviction drops an expired
    window first, otherwise the oldest key.
17. `clientIp(headers)` takes `x-forwarded-for`'s first comma-separated field, trimmed; if
    blank it falls through to `x-real-ip`, then `"unknown"`.

### Route — `POST /api/guess`

18. Ordering inside `POST` is **limit → parse → validate → call**. Any other order either
    does work for refused requests or forwards unvalidated input.
19. A body-size bound is applied before `req.json()`; the App Router has no automatic cap.
20. `word` matches `/^[a-z]{5}$/`; `seed` is a safe integer in `0 … 4_294_967_295`.
    Anything else is rejected and the upstream is not called.
21. Success → `200 { feedback }` with normalised, sorted results.
22. Upstream body text must never reach the client.

### Browser transport

23. `postGuess(word, seed, fetchImpl = fetch)` POSTs `{ word, seed }` as JSON to
    `/api/guess` and independently validates the reply. The JSON parse runs before the
    `response.ok` branch, so an unparseable body never reaches the error-extraction path.

### Page

24. A client component with a **Solve** button disabled while playing and labelled
    `Solving…`; one seed per game, generated once as
    `Math.floor(Math.random() * 1_000_000_000)`; a 600 ms pause awaited *before* the
    request when the guess counter is greater than zero, so each row stays on screen for a
    full interval regardless of upstream latency and the first guess appears immediately;
    rows render as they arrive on a board padded to `MAX_GUESSES`; the seed is visible once
    the status is not `idle`.
25. Accessibility: a progress line `Guess {attempt}/{MAX_GUESSES}…` and the outcome block
    are each wrapped in `aria-live="polite"`; every tile carries the feedback class **and**
    an `aria-label` of `"{letter-uppercased}, {result}"` (e.g. `"C, correct"`). The label
    is the only way a screen reader or a colour-blind viewer learns which result a tile
    carries — background colour alone conveys nothing to either.
26. CSS Modules (`page.module.css`) with classes for page, controls, button, seed, status,
    error, board, row, tile, the three feedback states, empty, outcome, result, detail.
    `globals.css` carries resets and theme variables.
27. Keep the component thin: no scoring, no validation, no error mapping in the page.

### Reducer

28. `idle` → `start` → `playing` with the seed, empty rows, attempt 0.
29. While `playing`: `attempt` updates the counter; `row` appends a guess; `finish` moves
    to `done` keeping seed and rows; `fail` moves to `error` keeping seed, rows and
    message.
30. `start` while already `playing` is **ignored** — the identical object is returned.
31. `start` from `done` or `error` begins a fresh game with empty rows.
32. Every action other than `start` is ignored outside `playing`. Ignoring rather than
    throwing is what lets an in-flight async guess dispatch harmlessly after a game has
    ended; the page loop has no cancellation, by scope.
33. State is never mutated in place — spread, never `push`.
34. An explicit exhaustiveness guard (`const _exhaustive: never = action;`) in `default`,
    never a bare `default: return state`.

### Outcome text

Built from `MAX_GUESSES`, never a literal `6`.

| Reason | `result` | `detail` |
|---|---|---|
| `solved` | `Solved in {attempts}/{MAX_GUESSES}` | `null` |
| `out-of-guesses` | `Not solved in {MAX_GUESSES} guesses` | the word was still possible, but the guesses were not enough to narrow it down |
| `no-candidates` | a distinct line, deliberately light in tone ("Brain freeze! 🍧 We ran out of words!") | `Guesses used: {attempts}/{MAX_GUESSES}` |

`no-candidates` is where the rejected "bigger fallback dictionary" alternative is paid for
in words instead of code. The text should read as a quirk of the game, not an application
error.

---

## 3. Error Handling

### Route mapping

See [decisions.md](../../docs/decisions.md#upstream-rejections-return-502) for why.

| Condition | Status | Body |
|---|---|---|
| Over the per-IP limit | `429` + `Retry-After` | `{ error: "Too many guesses. Try again in {n} seconds." }` |
| Invalid request shape | `400` | `{ error: "Invalid guess request" }` |
| Upstream `429` | `502` | `{ error: "The Wordle API is busy right now — try again in a moment." }` |
| Upstream `4xx` other than `429` | `502` | `{ error: "The Wordle API rejected the guess" }` |
| Upstream `5xx`, timeout, network failure, invalid reply | `502` | `{ error: "Could not reach the Wordle API" }` |

One generic `400` message for every invalid shape is intentional: the client is our own
code, which never sends an invalid request, so a detailed message would only help someone
probing the proxy. A response-latency oracle does partially undercut this, but the
validation rule is already published in full, so there is nothing to reverse-engineer.

The Votee `429` message is deliberately distinct from the generic 4xx wording (R17). It is
unrelated to our own per-IP limiter's 429.

Upstream body text never reaches the client. It is truncated in the adapter's error
message, logged server-side with the word and seed via `console.error`, and nothing more.
No Sentry, no tracker — out of scope.

### Browser transport messages

Each is rendered verbatim by the page.

| Condition | Thrown message |
|---|---|
| Non-ok reply with a non-empty string `error` | that server message, unchanged |
| Non-ok reply with no usable error (`{}`, `""`, `7`) | `"Something went wrong"` |
| Body fails to parse as JSON, or `fetchImpl` rejects | `"Could not reach the solver"` |
| Structurally invalid `feedback` | `"The solver returned an invalid reply"` |

`"Could not reach the solver"` (your network, or a platform error page) is deliberately
distinct from `"Could not reach the Wordle API"` (the server reached us but not Votee).

The page catches anything thrown and dispatches `fail` using
`err instanceof Error ? err.message : "Something went wrong"`, so the route's and client's
wording reaches the viewer unaltered.

---

## 4. Edge Cases

This table is the test inventory. Each row is a case a phase's failing test is written
against before the implementation exists.

| Case | Expected behaviour | Phase |
|---|---|---|
| `score("apple", "ppppp")` | `present, correct, correct, present, present` | 2 |
| Slots returned out of order (e.g. `[4,0,3,1,2]`) | sorted by `slot` before mapping | 1 |
| Reply echoing uppercase guess letters | accepted, compared case-insensitively | 1 |
| Slot outside 0–4, non-integer slot, duplicate slots | rejected as an invalid reply | 1 |
| Slot entry that is not an object (`null`, a number) | rejected | 1 |
| `result: "maybe"` or a non-string result | rejected | 1 |
| `guess` letter not matching the word at that slot | rejected — strongest signal the reply belongs to *this* request | 1 |
| Reply with 4 or 6 slots, or a JSON object instead of an array | rejected | 1 |
| Non-JSON 200 body | plain `Error`, **not** a `VoteeHttpError` | 1 |
| `VOTEE_API_URL` blank (`"   "`) | treated as unset; default used | 1 |
| `VOTEE_API_URL` = `not-a-url`, `ftp://…`, `file:///etc/passwd` | throws `VOTEE_API_URL must be an http(s) URL` | 1 |
| `VOTEE_API_URL` with trailing slash | normalised away | 1 |
| Seed `4294967295` | accepted; `4294967296` rejected | 1 |
| Missing body, non-JSON body, `"null"`, `"[]"`, `"7"` | `400`, upstream never called | 1 |
| `word` uppercase, 4 or 6 letters, containing a digit or hyphen | `400` | 1 |
| `seed` as string, fractional, negative, `NaN` | `400` | 1 |
| 31st request in a window from one IP | `429`; a different IP still succeeds; fetch never called | 1 |
| `x-forwarded-for: ", 203.0.113.7"` with `x-real-ip` set | falls through to `x-real-ip` — the rule is *the first field*, not the first non-empty one | 1 |
| Neither forwarding header present | `"unknown"` — one shared bucket, correct for the documented deployment | 1 |
| Limiter memory full, one expired + one active window | the expired one is evicted; the active one keeps its count | 1 |
| Limiter constructed without `maxKeys` | still bounded at `10_000` | 1 |
| `retryAfterSeconds` just before `resetAt` | `1`, never `0` | 1 |
| Answer in neither list (`sioux`, seed `143462397`) | `no-candidates`, sequence `["crane", "hoist", "spoil"]`, resolves rather than rejecting | 3 |
| Guess function always returning five `absent` | `no-candidates` in fewer than `MAX_GUESSES` | 3 |
| `watch` | `out-of-guesses`, exactly 6 guesses | 3 |
| `aster` (seed `584199032`) | solved via the allowed-guesses fallback | 2 |
| Near-anagram clusters (`gazer`, `grave`, `graze`, `patch`, `poker`) | all solved within 6 | 3 |
| Custom two-word list `["crane", "dogma"]` | `solved` | 3 |
| `start` dispatched while already playing | identical state object returned | 4 |
| `row`/`attempt`/`finish`/`fail` dispatched while `idle`/`done`/`error` | ignored, same object | 4 |
| `start` from `done` or `error` | fresh board, new seed, empty rows | 4 |

---

## 5. Boundary Traceability

Each boundary in [architecture.md](../../docs/architecture.md#boundaries) is a constraint
the code relies on, and each is enforced by a named test.

| Boundary | Built in | Enforced by |
|---|---|---|
| Only `votee-api.ts` touches the network on the server | 1.10, 3.1 | `solver.test.ts` drives `solve` with a stub and never stubs `fetch`; `bundle-boundaries.test.ts` — "only the Votee adapter calls fetch on the server" (6.2) |
| The page never statically imports the solver or word lists | 5.1–5.2 | `bundle-boundaries.test.ts` — "`src/app/page.tsx` imports solver/word-list modules as types only" |
| Answer-list words always come before allowed-guesses words | 2.9 | `solver.test.ts` — "plays answer-list words the same with the default list and an explicit WORDS list" |
| The word lists are pinned | 2.1–2.5 | `word-lists.test.ts` — length/shape/endpoints, no duplicates, SHA-256 checksum, no overlap |
| Games are deterministic | 3.3, 3.8, 3.9, 3.10 | `solver.test.ts` — the `quack` and `sioux` exact sequences; the exact solved/total counts |
| Replies are validated at both hops | 1.13–1.16, 1.29 | `votee-api.test.ts` (server hop) and `guess-client.test.ts` — "throws when the feedback isn't a valid 5-result array" (browser hop) |
| Imports are relative | 1.3–1.4 | `bundle-boundaries.test.ts` — "no source or test file imports through the `@/` alias"; "no vitest config file exists" |

Injection, not mocking frameworks: the solver takes a `GuessFn`, the browser client takes a
`fetchImpl`, the limiter takes `now`, and `voteeApiUrl` takes `env`. Global `fetch` is
stubbed only in the adapter and route tests, and unstubbed in an `afterEach`.

---

## 6. Rejected — Do Not Reintroduce

Each is a documented decision a rebuilder could plausibly re-derive. The phase task where
the temptation arises carries a "do not do X because Y" note. All 18 are cited by at least
one phase task; renumbering these breaks those citations.

| # | Rejected | Why | Surfaces at |
|---|---|---|---|
| R1 | Real two-pass Wordle scoring | Would discard the true answer when a guess repeats a letter more often than the answer | 2.7 |
| R2 | A random opener, or a random answer-list word each game | Wins less (97.15% / 4.12) and makes the same seed play differently, which the tests rely on | 3.2 |
| R3 | Allowing any answer-list word as a probe guess | Reached 100% on a sample but made `npm test` take minutes and each browser pick up to half a second | 3.3 |
| R4 | "First remaining candidate" next-guess strategy | 97.97% / 3.92 guesses versus 99.57% / 3.55 | 3.3 |
| R5 | Feedback as arrays of strings during filtering | Integer codes are ~6.5× faster and play identical games | 2.6 |
| R6 | A bigger fallback dictionary, or letter probing, for words in neither list | The page explains a `no-candidates` stop instead | 3.4, 4.8 |
| R7 | A shared rate-limit store (Upstash, Vercel KV) or Vercel Firewall rules | More infrastructure than a single-guess proxy needs | 1.21 |
| R8 | Refusing new IPs when the limiter's memory is full | A flood would lock out every real new visitor | 1.21 |
| R9 | Mapping an upstream failure to a `4xx` of our own | The request already passed our validation, so the fault is upstream | 1.26 |
| R10 | Retrying failed upstream calls | Every guess already requires an uncached Votee request, so retries would multiply load during the outage they are meant to smooth over | 1.26 |
| R11 | Running the whole game on the server and returning a finished result | "It read as an answer appearing, not as a program playing" | 1.23, 4.9 |
| R12 | Calling `/random` without a seed | The API changes the word on every call, so feedback would not carry between guesses | 1.11, 4.9 |
| R13 | A Content-Security-Policy with nonces | Deferred; Next.js inline scripts need nonces | 1.1, 5.4 |
| R14 | Automated UI/browser tests | The page is checked by hand | 5.5 |
| R15 | Requiring a `.env` file to install, test or run the checks | A fresh clone must work without one | 1.8 |
| R16 | Adding `response.status` to `guess-client.ts`'s "Could not reach the solver" message | That path is defined by never having parsed a body, and the `fetchImpl` rejection case has no `response` at all; a status at one throw-site and not the other is worse than neither | 1.28 |
| R17 | Folding a Votee `429` into the generic "rejected the guess" message | Conflates "Votee is rate-limiting us" with "the guess was malformed" — a fixable-by-waiting condition mislabeled as a validation failure | 1.26 |
| R18 | A second, hand-written copy of the three valid result strings in `votee-api.ts` and `guess-client.ts` | Both hops write independent *validation logic* on purpose; duplicating the *literal enum* adds silent-drift risk with no boundary benefit | 1.7, 1.15, 1.29 |

Not formal Clean Architecture, MVC, CQRS, Repository or Event Sourcing; "next-guess
strategy" is an algorithmic choice, not the GoF Strategy pattern. Do not add those layers
([technical-analysis.md](../../docs/technical-analysis.md#design-patterns)).
