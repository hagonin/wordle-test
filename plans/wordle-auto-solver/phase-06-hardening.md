---
phase: 6
title: "Phase 6: Hardening"
status: todo
priority: P1
effort: "3h"
dependencies: [5]
---

# Phase 6: Hardening

## Goal

Confirm the build matches the specification, close the last architecture boundary with a
test, and prove no rejected alternative crept back in. Nothing new is built here beyond one
fitness test.

## Context Links

- Specification: [plan.md](./plan.md) §15 (traceability matrix), §16 (benchmark), §17
  (acceptance criteria), §19 (rejected-alternatives register)
- Source docs: [operations.md](../../docs/operations.md#requirements),
  [operations.md](../../docs/operations.md#deployment)

## Key Insights

- The main risk at this stage is a **green suite that passes thresholds while differing from
  the specification** — a solver variant that clears 99% but is not *this* solver. The exact
  counts are the instrument that distinguishes the two.
- A boundary whose test cannot be named is not enforced. Do not sign off on it.
- The live figures in [plan.md](./plan.md) §16 are a dated observation of the upstream API,
  not a contract.

## Requirements

Every item in [plan.md](./plan.md) §17 (Acceptance Criteria) must be demonstrably true.

## Files to Create / Modify

- Modify: `tests/bundle-boundaries.test.ts` (one new case)
- Modify: none in `src/` expected. A source change here means an earlier phase was incomplete.

## Tests Before

- [ ] The server-`fetch` fitness case, written and run before the audits so an unnoticed leak
      surfaces as a test failure rather than as a reviewer's observation.

## Tasks & Steps

- [ ] **6.1 Full suite and clean-clone checks.** Run, in order:

  ```sh
  npm test
  npx tsc --noEmit
  npm run lint
  npm run build
  ```

  Then the guarantee that a fresh clone works with no configuration: clone into a clean
  directory with **no `.env` file**, `npm install`, and repeat all four commands. Confirm the
  tests never need the network by running `npm test` with networking disabled — any failure
  means a module reaches the network outside `votee-api.ts`.
- [ ] **6.2 Close the server-network boundary with a test.** Until now this has held by
  construction and by the absence of `fetch` stubs in the solver tests. Make it explicit.
  Extend `tests/bundle-boundaries.test.ts` with a case named **"only the Votee adapter calls
  fetch on the server"**: read every `.ts`/`.tsx` under `src/`, excluding **only**
  `src/lib/votee-api.ts`, and assert none contains a `fetch(` call — matching
  `globalThis.fetch(`, `window.fetch(` and a bare `fetch(` alike, so an indirect reference
  cannot slip past a plain substring scan. **Do not exclude `src/lib/guess-client.ts`**: it
  calls only its injected `fetchImpl(`, which never matches the pattern, so the exclusion
  hides nothing today — but it would hide a real regression the day a literal `fetch(` is
  added there. If the case is red, a network call has leaked into the solver or the route;
  move it behind the adapter.
- [ ] **6.3 Boundary traceability audit.** Walk [plan.md](./plan.md) §15's matrix and confirm
  each named test exists and passes:

  | Boundary | Test to confirm |
  |---|---|
  | Only `votee-api.ts` touches the network | 6.2's case; no `fetch` stub in `tests/solver.test.ts` |
  | Page never statically imports solver/word lists | "`src/app/page.tsx` imports solver/word-list modules as types only" |
  | Answer-list words first | "plays answer-list words the same with the default list and an explicit WORDS list" |
  | Word lists pinned | `tests/word-lists.test.ts` — lengths, shapes, endpoints, duplicates, checksums, no overlap |
  | Games deterministic | the `quack` and `sioux` exact sequences; exact counts 2305 / 8188 / 943 / 4411 |
  | Replies validated at both hops | `tests/votee-api.test.ts` slot validation; "throws when the feedback isn't a valid 5-result array" |
  | Imports are relative | "no source or test file imports through the `@/` alias"; "no vitest config file exists" |

  **A boundary whose test cannot be named is not enforced. Do not sign off on it.**
- [ ] **6.4 Rejected-alternatives audit.** Walk [plan.md](./plan.md) §19's register against the
  built tree. Concretely confirm:
  - `score` is single-pass with no letter counting (**R1**), and the `apple`/`ppppp` case
    passes.
  - The opener is the literal `crane`, with no randomness and no configuration (**R2**).
  - The next-guess pool is the surviving candidates, answer-list-filtered — not the whole
    answer list (**R3**) — and is chosen by distinct-partition count, not first-survivor
    (**R4**).
  - Filtering and selection compare integer codes, not string arrays (**R5**).
  - There is no third dictionary and no letter-probing path (**R6**); `no-candidates` is
    explained in `outcome.ts`.
  - The limiter is in-process with no external store or firewall rules (**R7**), and eviction
    drops expired windows before the oldest, never refusing new keys (**R8**).
  - Upstream failures map to `502`, never to a `4xx` of our own (**R9**), and there is no
    retry anywhere (**R10**).
  - The route handles one guess and holds no game state (**R11**); the seed is generated once
    per game in the page and relayed unchanged (**R12**).
  - No CSP or security-header middleware (**R13**), no Playwright or browser automation
    (**R14**), no code path requiring `.env` (**R15**).
  - `guess-client.ts`'s platform-failure message carries no `response.status` (**R16**); a
    Votee `429` gets its own distinct message rather than the generic 4xx rejection (**R17**);
    `votee-api.ts` and `guess-client.ts` each import `VALID_RESULTS` from `constants.ts`
    rather than hand-writing a second copy (**R18**).
- [ ] **6.5 Measured results.** Re-read the logged figures from the Phase 3 cases and compare
  with [plan.md](./plan.md) §16: answer list 2,305 / 2,315 (99.57%), 3.55 average guesses;
  allowed-guesses sample 943 / 1,066 (88.46%). An exact match means the build reproduces the
  documented behaviour, not merely something that passes the thresholds. **A near-miss that
  still clears the thresholds is a real difference and should be diagnosed before sign-off** —
  most likely the tie-break comparison, the pool filter, or a word-list revision. The live
  figures (40 random seeds on 2026-09-15: 26 answer-list, 8 allowed-guesses, 6 no-candidates,
  0 out-of-guesses) are a dated observation, not a contract: do not attempt to reproduce them,
  and do not treat a different live distribution as a regression.
- [ ] **6.6 Scope audit.** Confirm none of [plan.md](./plan.md) §1's out-of-scope items has
  been added: other word sizes, `/daily` or `/word/{word}`, manual play, a cancel button, a
  database, server-side streaming, automated UI tests, a shared rate-limit store, a CSP with
  nonces, analytics or error tracking. Also confirm nothing from §19's "Recommended evolution"
  was implemented opportunistically — no Web Worker, no expanded dictionary, no shared
  limiter, no browser-level test, no extra architectural layer. Those are future options
  requiring their own decisions, and the first of them explicitly requires agreeing a success
  target before changing the solver.
- [ ] **6.7 Deployment readiness.** Confirm the app builds for Vercel with no config file —
  Vercel detects Next.js automatically. **Do not** set up CI or deploy as part of this plan;
  CI and deployment are documented as not yet set up and live in their own plan.

## Refactor

None expected. If an audit finds a violation, fix it in the owning phase's module and re-run
that phase's verification before returning here.

## Tests After

6.2's case is the fourth and final architecture fitness test. After this phase the suite
holds: alias scan, no-vitest-config, type-only imports, server `fetch`, word-list pins, exact
solve counts, and exact guess sequences.

## Success Criteria — Definition of Done

- [ ] All four commands green on a clean clone with no `.env`.
- [ ] `npm test` green with networking disabled.
- [ ] Every boundary traced to a passing, named test (6.3).
- [ ] Every rejected alternative confirmed absent (6.4).
- [ ] Solve rates match the documented measurements **exactly** (6.5).
- [ ] No out-of-scope feature present (6.6).
- [ ] `npm run build` succeeds for Vercel with no config file (6.7).

## Verification

```sh
npm test && npx tsc --noEmit && npm run lint && npm run build
# then, in a clean clone with no .env:
npm install && npm test && npx tsc --noEmit && npm run lint && npm run build
```

## Risk Assessment

| Risk | Mitigation |
|---|---|
| A green suite that differs from the specification | 6.5's exact counts distinguish "passes the threshold" from "is this solver"; treat a mismatch as a finding, not noise |
| Signing off a boundary without naming its test | 6.3 forbids it explicitly |
| Opportunistic scope creep from the evolution list | 6.6 audits for it by name |
| Treating a different live distribution as a regression | 6.5 states the live figures are an observation, not a contract |

## Security Considerations

Final confirmation that no secrets, tokens or `.env` files are committed, that upstream body
text never reaches the client, and that the absent CSP is a recorded decision rather than an
oversight.

## Rollback

This phase adds one test. Removing it returns the server-network boundary to convention-only
enforcement; nothing else is affected.

## Next Steps

The build is complete and ready for deployment. CI and Vercel setup are a separate plan.
