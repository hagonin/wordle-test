---
phase: 1
title: "Phase 1: API Client"
status: todo
priority: P1
effort: "1d"
dependencies: []
---

# Phase 1: API Client

## Goal

Stand up the project and build everything that touches the network — configuration, the
Votee adapter, the per-IP rate limiter, the `POST /api/guess` proxy and the browser
transport — so that a single guess can travel from the browser to Votee and back, fully
validated at both hops.

## Context Links

- Specification: [plan.md](./plan.md) §4 (Wordle API), §5 (requirements 9–22), §6
  (architecture), §11 (error handling), §12 (edge cases)
- Literal default host: [pinned-data.md](./pinned-data.md#stage-0--default_votee_api_url)
- Source docs: [operations.md](../../docs/operations.md),
  [decisions.md](../../docs/decisions.md),
  [technical-analysis.md](../../docs/technical-analysis.md)

## Key Insights

- The adapter exists because the upstream is irregular: unordered slots, inconsistent
  error formats (`400` plain text, `422` JSON, `500` for `size=0`), non-words accepted.
  **Never assume a JSON error shape.**
- `voteeApiUrl()` must validate at *call* time, not module load, or a bad value on a
  build machine breaks `npm run build` and the "no `.env` needed" guarantee becomes
  fragile.
- The limiter is a factory, not a module-level singleton, so tests get isolated instances
  while the route owns exactly one.
- The two hops validate replies with **independently written** predicates. They share only
  the `VALID_RESULTS` literal.

## Requirements

Functional (from [plan.md](./plan.md) §5): 9, 10 (constants and config), 12, 13 (adapter),
14–17 (limiter), 18–21 (route), 22 (browser transport).

Non-functional:

- Vitest runs with **no `vitest.config.ts`**, which is only possible because no file uses a
  path alias.
- A fresh clone installs, tests and builds with no `.env` file.
- No test reaches the network; every case injects or stubs its transport.

## Architecture

```text
page.tsx ──► postGuess(word, seed, fetchImpl) ──► POST /api/guess
                                                     │  limit → parse → validate
                                                     ▼
                                          guessRandom(word, seed) ──► GET {host}/random
                                          (10s timeout, slot validation, sort)
```

`src/lib/votee-api.ts` is the only module on the server permitted to call `fetch`.
`src/lib/constants.ts` is network-free and dependency-free so both hops can import
`VALID_RESULTS` without dragging the solver or word lists anywhere.

## Files to Create / Modify

- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`,
  `.gitignore`, `.env.example`, `src/app/layout.tsx`, `src/app/globals.css`,
  `src/app/page.tsx` (placeholder)
- Create: `src/lib/constants.ts`, `src/lib/config.ts`, `src/lib/votee-api.ts`,
  `src/lib/rate-limit.ts`, `src/lib/guess-client.ts`, `src/app/api/guess/route.ts`
- Create: `tests/bundle-boundaries.test.ts`, `tests/config.test.ts`,
  `tests/votee-api.test.ts`, `tests/rate-limit.test.ts`, `tests/guess-route.test.ts`,
  `tests/guess-client.test.ts`, `tests/helpers/slots.ts`

## Tests Before

Written first, each seen failing for its stated reason before any implementation:

| Test file | Cases first red |
|---|---|
| `bundle-boundaries.test.ts` | alias scan, no-vitest-config |
| `config.test.ts` | `MAX_GUESSES`, `VALID_RESULTS`, four `voteeApiUrl` cases |
| `votee-api.test.ts` | request shape, seed, env override, sorting, HTTP errors, malformed bodies, per-slot validation, uppercase letters |
| `rate-limit.test.ts` | allow/refuse, countdown, key independence, two eviction policies, default bound, four `clientIp` cases |
| `guess-route.test.ts` | happy path, 429 ordering, validation table, four error mappings |
| `guess-client.test.ts` | request shape, happy path, four error messages, feedback validation |

Two fitness cases (the alias scan and the no-config assertion) pass on an empty tree. That
is expected and stated honestly: they are written now for regression pressure over every
later phase, not as red-then-green units.

## Tasks & Steps

### Group A — Scaffolding (1.1–1.5)

- [] **1.1 Scaffold the project.** *Not test-driven — this is the substrate.* Next.js App
  Router in TypeScript strict mode, ESLint, CSS Modules, Vitest as a dev dependency with
  **no `vitest.config.ts`**. `engines.node >= 20.9.0`. Scripts `dev`, `build`, `start`,
  `lint`, `test` (`vitest run`). `next.config.ts` empty of options — Vercel detects Next.js
  without configuration. `src/app/page.tsx` stays a placeholder until Phase 5. `.gitignore`
  excludes `.env`, `node_modules`, `.next`, `tsconfig.tsbuildinfo`. **R13 — no CSP or
  security headers**; a CSP is deferred because Next.js inline scripts need nonces, and
  baseline headers are planned with CI, which is not set up. Do not set up CI or a Vercel
  project. *Verify:* `npx tsc --noEmit` and `npm run build` pass.
- [] **1.2 Prove the runner works with zero configuration.** Add
  `tests/bundle-boundaries.test.ts` with one trivial assertion; run `npm test`. The point
  is the *absence* of a config file — if the run needs one, the alias boundary is already
  violated.
- [] **1.3 Enforce the relative-imports boundary.** Replace the trivial assertion with
  **"no source or test file imports through the `@/` alias"**: read every `.ts`/`.tsx`
  under `src/` and `tests/`, matching any `@/` segment in a `from "…"` clause or inside an
  `import(…)`/`require(…)` argument. **Scan the whole file text, not lines beginning with
  `import `** — a line-prefix scan misses a multiline import, a `require`, and a dynamic
  `await import()`. If the scaffold wrote a `paths` entry into `tsconfig.json`, remove it
  so the alias cannot be used by accident.
- [] **1.4 Pin the configuration contract.** Case **"no vitest config file exists"**
  asserting none of `vitest.config.ts|js|mts` is present at the repo root.
- [] **1.5 Write `.env.example`.** Document `VOTEE_API_URL` as optional, stating the
  default host and the http(s) requirement. Do not read the variable anywhere yet.

### Group B — Constants and configuration (1.6–1.8)

- [ ] **1.6 The guess cap.** `tests/config.test.ts`, case **"MAX_GUESSES is 6"** importing
  from `../src/lib/constants`. Implement `export const MAX_GUESSES = 6;`.
- [ ] **1.7 The shared result-string constant.** Case **"VALID_RESULTS has exactly the
  three result strings"** asserting `["correct", "present", "absent"]` — pin an exact array
  so the literal stays visible and reviewable. Implement as `as const`, with **no dependency
  on `solver.ts`'s `Result` type**: `constants.ts` must stay importable before the solver
  exists and must never gain a dependency that pulls the word lists toward the browser
  bundle. **R18** — both hops import this literal rather than hand-writing a second copy;
  they still write independent *predicates* around it.
- [ ] **1.8 Config: default, blank, override, loud failure.** Four cases. **"returns the
  default when VOTEE_API_URL is unset"** (`voteeApiUrl({})`). **"…when blank"** (`"   "` —
  a naive truthiness check passes it through and returns a broken host). **"returns a valid
  http(s) override with no trailing slash"** (`"https://example.test/"` →
  `"https://example.test"`, plus an `http://` variant in the same case). **"throws when
  VOTEE_API_URL is not an http(s) URL"**, table-driven over `not-a-url` (unparseable),
  `ftp://example.test` (parseable, wrong protocol) and `file:///etc/passwd`, each throwing
  `VOTEE_API_URL must be an http(s) URL` — one shared message is deliberate; nothing is
  gained by distinguishing the two failure kinds in an operator-facing error. Implement with
  `new URL` in try/catch plus a protocol check, then strip a single trailing slash.
  **Validate at call time, not module load.** **R15** — the injectable `env` parameter keeps
  the no-`.env` guarantee testable; tests never mutate `process.env` (one narrow exception:
  task 1.11). The literal default URL comes from
  [pinned-data.md](./pinned-data.md#stage-0--default_votee_api_url).

### Group C — Votee adapter (1.9–1.16)

- [ ] **1.9 The shared slot fixture.** `tests/helpers/slots.ts`:
  `slotsReply(word, results, order = results.map((_, i) => i))` emitting
  `order.map(slot => ({ slot, guess: word[slot], result: results[slot] }))` as a JSON
  `Response`. The `order` parameter makes out-of-order replies a one-line input; it exists
  because unordered slots are a documented quirk, not an edge case. The route tests reuse
  it.
- [ ] **1.10 Adapter request shape.** Case **"requests the right URL and options"**: stub
  global `fetch`, call `guessRandom("crane", 42)`, assert one call with `guess=crane`,
  `size=5`, `seed=42`, `cache: "no-store"` and an `AbortSignal`. **Pin the timeout's value,
  not merely its presence** — spy on `AbortSignal.timeout` and assert `10_000`, or drive
  fake timers and assert unaborted at 9,999 ms and aborted at 10,000 ms. Build the query
  with `URLSearchParams`. `size=5` is fixed; do not thread a size parameter through for
  future flexibility — other sizes are out of scope and `size=0` is a documented `500`.
- [ ] **1.11 Seed forwarded unchanged, host honoured.** Assert the query contains exactly
  `String(seed)` for a large seed such as `4294967295`. **R12** — no omission, defaulting or
  regeneration; range validation belongs to the route. Then case **"uses VOTEE_API_URL when
  set"**: set the variable for the duration of the case, assert the fetched URL starts with
  the override, restore afterwards. *This is the one deliberate exception to 1.8's "tests
  never mutate `process.env`": `guessRandom` has no injectable env parameter the way
  `voteeApiUrl(env)` does, so there is no other way to prove it reads the variable at
  request time.* Call `voteeApiUrl()` **inside** `guessRandom`, which is what makes
  "anything else throws when a guess is made" true.
- [ ] **1.12 Sorting unordered slots.** Case **"sorts slots returned out of order"** using
  `slotsReply("crane", results, [4, 0, 3, 1, 2])`. A naive `data.map(s => s.result)` returns
  the API's arbitrary order, which mis-scores every guess and surfaces only as a mysteriously
  low solve rate. Sort a **copy**, not the parsed array in place.
- [ ] **1.13 Non-2xx becomes a typed HTTP error.** Three cases: the message contains the
  status and a body excerpt; a `400` with a plain-text body gives `VoteeHttpError` with
  `status === 400`; a `500` gives `status === 500`. Both classes are needed because the
  route maps them differently. Read the body as **text**, never `json()` — documented `400`s
  are plain text, and `response.json()` would throw inside the error path and mask the real
  status. **Truncate** the excerpt: it is attacker-influenced upstream data that will be
  logged.
- [ ] **1.14 Malformed and structurally invalid replies.** Cases: a non-JSON 200 body throws
  naming an invalid reply; the same error is **not** a `VoteeHttpError` (the route keys its
  message on the type, and nothing was *rejected* — the reply was unusable); a JSON object
  instead of an array; 4 slots and 6 slots. Use a shared `invalidReply(reason)` helper.
- [ ] **1.15 Per-slot validation.** One case each, so a failure names the violated rule:
  slot outside 0–4; non-integer slot (`1.5`); **duplicate slots** (this is what makes
  "exactly 5 entries" mean "exactly one per position" — without it, five copies of slot 0
  pass and the sort produces nonsense); invalid `result` value (`"maybe"`) and a non-string
  result; a `guess` letter not matching the word at that slot (the strongest signal the
  reply belongs to *this* request — without it a stale cache or a JSON-shaped proxy error
  page is accepted and scored); a slot entry that is not an object (`null`, a number).
  Validate `result` against `new Set(VALID_RESULTS)` imported from `./constants`; track seen
  slots in a `Set`.
- [ ] **1.16 Case-insensitive guess letters.** Case **"accepts uppercase guess letters"**.
  The echo casing is not contractually specified, and rejecting over casing would turn every
  guess into a `502`. Compare `guess.toLowerCase()` with `word[slot]?.toLowerCase()`; the
  optional chain keeps the comparison total rather than relying on an earlier check.

### Group D — Rate limiter (1.17–1.22)

- [ ] **1.17 Allow, then refuse.** Case **"allows the first `limit` requests for a key, then
  refuses with retryAfterSeconds at the window length"**, with a small limit (3), a 60 s
  window and a controllable `now`; assert `remaining` counts `2, 1, 0` then a refusal. Use a
  small limit, **not 30** — the route pins the real configuration, and the limiter's own
  tests should exercise the mechanism. Implement a `Map<string, { count, resetAt }>` behind a
  factory.
- [ ] **1.18 Countdown and the next window.** Exhaust at `t0`, advance partway, assert the
  countdown decreased; advance to just before `resetAt` and assert
  `retryAfterSeconds === 1`, never `0` — a `Retry-After: 0` invites an immediate retry that
  will itself be refused; advance past `resetAt` and assert a fresh window with full
  allowance. Implement `Math.max(1, Math.ceil((resetAt - now) / 1000))` and treat
  `resetAt <= now` as expired, consistently in both the refresh check and the eviction scan.
- [ ] **1.19 Keys are independent.** Exhaust one key, assert a second is still allowed.
- [ ] **1.20 Bounded memory, oldest-first eviction.** Case **"bounds memory by maxKeys,
  evicting the oldest key first"** with `maxKeys: 2` and active windows; assert the map did
  not grow and the earliest-inserted key's count was dropped. `Map` preserves insertion
  order, so `windows.keys().next().value` is the oldest. Guard eviction with
  `!windows.has(key)` — refreshing an existing expired key is a replacement, not growth.
  Add **"is bounded when maxKeys is not supplied"**, asserting the finite default `10_000`;
  without it every eviction case passes with a two-key test limiter while the production
  call, which omits `maxKeys`, grows forever.
- [ ] **1.21 Expired windows evicted first.** With a tiny `maxKeys`, one expired window and
  one active, insert a new key and assert the **expired** one was dropped and the active one
  kept its count. A pure oldest-first policy evicts the active key if it was inserted first
  — precisely what the decision rejects. **R8 — do not** refuse new IPs when memory is full;
  a flood would lock out every real new visitor, and the accepted trade-off is that a flood
  can reset an older client's count. The linear scan is bounded by `maxKeys` and runs only
  when full — no LRU, no priority structure. **R7 — do not** add a shared store or firewall
  rules. **Do not** harden `x-forwarded-for` against spoofing: the header is trustworthy on
  Vercel, and the risk elsewhere is a documented, accepted caveat.
- [ ] **1.22 Client IP from forwarding headers.** Four cases: first `x-forwarded-for` entry
  trimmed (`" 203.0.113.7 , 198.51.100.1 "` → `"203.0.113.7"`); falls back to `x-real-ip`
  when the first field is **blank** (`", 203.0.113.7"` + `x-real-ip` → the `x-real-ip` value
  — the rule is *the first field*, not the first non-empty one, because a later entry is an
  intermediate proxy, not the client); falls back when `x-forwarded-for` is absent, trimmed;
  returns `"unknown"` when neither is present. A shared `"unknown"` bucket is correct for the
  documented deployment: on Vercel the headers are always set, so `"unknown"` indicates
  direct access, which deserves a shared allowance rather than an unlimited one.

### Group E — Route (1.23–1.27)

- [ ] **1.23 Route happy path.** Import `POST` directly and call it with a constructed
  `Request` — no HTTP server. **Give every case its own client IP**, since the limiter is a
  module-level singleton whose counters persist across cases in a file. Case **"returns
  sorted feedback and forwards guess/size/seed to the upstream URL"** using an out-of-order
  `slotsReply`. This case deliberately spans the route *and* the adapter; mocking
  `guessRandom` would leave the wiring unverified. **R11** — the route handles one guess,
  keeps no session, holds no state beyond the limiter's counters.
- [ ] **1.24 The limiter runs first.** Case **"returns 429 with Retry-After after 30
  requests from one IP, and does not affect other IPs"**: 30 `200`s from a dedicated IP, then
  a 31st asserting `429`, a numeric `Retry-After`, the exact body
  `{ error: "Too many guesses. Try again in {n} seconds." }` for the `n` the header carries,
  **that the fetch mock was never called**, and that another IP still succeeds. This is the
  only test pinning the 30 / 60 s pair. Create one module-scope
  `createRateLimiter({ limit: 30, windowMs: 60_000 })`, relying on the tested finite
  `maxKeys` default — omitting it is deliberate and safe *only* because that default exists.
  Module scope means per-instance counts and cold-start resets: documented, accepted
  behaviour. Do not move it into the handler (which would reset it every request).
- [ ] **1.25 Request validation.** Table-driven **"rejects {name} with 400 and never calls
  fetch"**, one entry per invalid shape from [plan.md](./plan.md) §12, each with its own IP,
  each asserting `400`, the exact body `{ error: "Invalid guess request" }`, and no fetch
  call. Add **"accepts the maximum allowed seed"** (`4294967295`) — an off-by-one in the cap
  is otherwise invisible. Try/catch `req.json()` defaulting to `null`; narrow to a record
  only for a non-null object; validate `word` with the pattern and `seed` with
  `Number.isSafeInteger` plus the range. One generic message for every invalid shape is
  intentional: the client is our own code, so a detailed message would only help someone
  probing the proxy. The lowercase-only rule is stricter than the upstream, and that
  strictness is ours to keep — the solver only ever emits lowercase five-letter words.
- [ ] **1.26 Error mapping.** Case **"returns 502 when upstream fails, without leaking
  upstream text"** — stub a `500` whose body contains a recognisable secret string and assert
  it is absent from the response. Case **"returns 502 with a rejection message … 4xx"** using
  a plain-text `400`. Case **"returns 502 with a distinct message when upstream rate-limits
  us with a 429"** (**R17**) — check `status === 429` *before* the general
  `400 <= status <= 499` branch. Case **"returns 502 with the generic message when fetch
  itself rejects"**, and one for a structurally invalid 200 reply (not a `VoteeHttpError`, so
  it must not be reported as a rejection). **In every upstream-failure case, also assert the
  fetch mock was called exactly once** — that is what makes "no retry" (**R10**) an actually
  tested contract, since a quiet single retry returns the same `502` body and passes every
  other assertion. **R9** — never a `4xx` of our own.
- [ ] **1.27 Server-side diagnostics.** *No test:* asserting on `console.error` would pin a
  log format no consumer depends on, and there is no error tracking by scope. In the catch,
  `console.error` the word, seed and error. The upstream excerpt reaches the log, never the
  client. Do not add Sentry or any tracker.

### Group F — Browser transport (1.28–1.29)

- [ ] **1.28 Browser transport.** `describe("postGuess")`: **"sends POST to /api/guess with
  the JSON body"** (a root-relative path, correct for a same-origin BFF and why the browser
  never needs to know the Votee host); **"returns the feedback on a valid 200 reply"**;
  **"throws the server's error message on a non-ok JSON reply"** (a `429` whose `{ error }`
  string must arrive verbatim, or the viewer loses both the retry hint and the distinction
  between the two 502 messages); **"throws Something went wrong on a non-ok JSON reply with
  no usable error"** (`{}`, `{ error: "" }`, `{ error: 7 }`); **"throws Could not reach the
  solver when the body fails to parse as JSON"**; **"throws when fetch rejects"** with the
  same message. Parse the body **first**, so an unparseable body never reaches the
  error-extraction path — the two are distinguished by *where* the failure happens, not by
  status. **R16** applies: no `response.status` in that message.
- [ ] **1.29 Independent reply validation.** Case **"throws when the feedback isn't a valid
  5-result array"**, table-driven over: absent; `"correct"`; empty; length 4 and 6;
  containing `"maybe"`; containing a number or `null`; a body that is not an object. Each
  throws `"The solver returned an invalid reply"`. Write `isValidFeedback` **independently**
  — do not import `votee-api.ts`'s predicate. Sharing it would mean one bug disables both
  hops and would pull server code, and transitively the word lists, into the browser bundle.
  Importing only `VALID_RESULTS` from the small, network-free `constants.ts` shares a
  literal, not logic. Import `Result` with `import type`.

## Refactor

There is no legacy code to protect in this phase — the repository starts empty. "Refactor"
here means the implementation written under each red test above, in the same order, with no
step implementing more than its test demands. The one structural decision worth naming: the
limiter is a **factory**, so the route's single module-scope instance and the tests'
isolated instances come from the same code path.

## Tests After

Once the modules exist, two fitness cases in `tests/bundle-boundaries.test.ts` carry forward
as regression pressure over every later phase: the `@/` alias scan (1.3) and the
no-vitest-config assertion (1.4). The server-`fetch` fitness test that completes this set is
deliberately deferred to Phase 6, once every module that could violate it exists.

## Success Criteria

- [ ] All six test files green; `npm test` passes with no `vitest.config.ts` present.
- [ ] `npx tsc --noEmit`, `npm run lint` and `npm run build` pass with no `.env` file.
- [ ] Every case that stubs global `fetch` unstubs it in an `afterEach`; every transport case
      injects `fetchImpl` instead of stubbing the global.
- [ ] The rate-limit case's dedicated IP appears nowhere else in `tests/guess-route.test.ts`.
- [ ] The 10 s timeout is asserted by value, not merely by presence.
- [ ] No upstream body text appears in any client-facing response.

## Verification

```sh
npx vitest run tests/config.test.ts tests/votee-api.test.ts tests/rate-limit.test.ts \
  tests/guess-route.test.ts tests/guess-client.test.ts tests/bundle-boundaries.test.ts
npm test
npx tsc --noEmit
npm run lint
npm run build
```

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Next.js scaffold drift (path alias, extra deps, different layout) | Read the guide in `node_modules/next/dist/docs/` before writing App Router code, per the repository's `AGENTS.md`; 1.3 and 1.4 catch the alias and config regressions |
| Reading an error body as JSON | 1.13 pins text reading; documented `400`s are plain text |
| Sorting in place, or not at all | 1.12 is the only thing between correct feedback and a silently wrong game |
| Eviction order | 1.20 and 1.21 must both be present; either alone permits a wrong policy |
| Shared limiter state across route cases | Per-case IPs; if a case ever needs a clean limiter, reset modules rather than lowering the limit |
| Wrong handler ordering | Limit → parse → validate → call; any other order either does work for refused requests or forwards unvalidated input |
| Sharing the validator between hops | Tempting DRY; it deletes the boundary |

## Security Considerations

- Upstream body excerpts are truncated at the adapter and logged server-side only; they
  never reach the browser (asserted in 1.26).
- One generic `400` message avoids helping someone probe the proxy.
- The limiter bounds its own memory (`maxKeys`), and eviction never locks out new visitors.
- `VOTEE_API_URL` is not a secret, but a non-http(s) value fails loudly rather than
  silently pointing the server at a scheme `fetch` cannot use.
- No secrets, tokens or `.env` files are committed.

## Rollback

Delete the working tree and re-scaffold; nothing downstream exists yet. To roll back only
the network layer, delete `src/lib/votee-api.ts`, `src/lib/rate-limit.ts`,
`src/app/api/guess/route.ts`, `src/lib/guess-client.ts` and their tests — but keep
`tests/helpers/slots.ts`.

## Next Steps

Phase 2 (Filtering Engine) depends on `src/lib/constants.ts` from this phase and on nothing
else here.
