# Benchmarks

Measured results for the solver. These are **dated measurements, not live figures**.
The offline totals are enforced by `tests/solver.test.ts`; rerun `npm test` for current
values.

Thresholds have little slack on purpose. The solver is deterministic, so the rate moves
only when the code or the word lists change. Tests that look "too strict" are the
mechanism — loosening them removes the guarantee rather than fixing a problem.

## Measured results

### Offline, answer list (2026-09-14)

| Metric | Value |
|---|---|
| Solved | 2,305 of 2,315 (99.57%) |
| Average guesses over solved games | 3.55 |
| Total guesses over solved games | 8,188 |

### Offline, allowed-guesses sample (2026-09-14)

| Metric | Value |
|---|---|
| Solved | 943 of 1,066 (88.46%) |
| Total guesses over solved games | 4,411 |
| Sampling | every 10th word — a full run is too slow for the suite |

The 88.46% sits further above its 85% floor than the answer list does above 99%. That is
appropriate: these words are only reachable through the fallback pool.

### Live, 40 random seeds (2026-09-15)

| Outcome | Games |
|---|---|
| Solved from the answer list | 26 |
| Solved from the allowed-guesses list | 8 |
| Ended with `no-candidates` | 6 |
| Ran out of guesses | 0 |

The share of words outside the answer list was higher than the "answer list first" design
assumed.

## Enforced thresholds and anchors

The thresholds state what the project promises; the exact counts state that the
implementation has not drifted at all. Both are asserted.

| Assertion | Value |
|---|---|
| Answer-list solve rate | ≥ 99% |
| Answer-list average guesses over solved games | ≤ 3.65 |
| Allowed-guesses sample solve rate | ≥ 85% |
| Answer-list exact anchor | `2305` solved / `8188` total guesses |
| Allowed-guesses sample exact anchor | `943` solved / `4411` total guesses |
| Answer list length | 2,315 words |
| Allowed-guesses list length | 10,657 words |

The literal word lists, their pinned gist URLs with revision hashes, and both SHA-256
checksums live in the plan's data appendix, not here.

## Opener benchmark

One-off script, 2026-09-14, answer-list words only, measured under the earlier "first
remaining candidate" strategy.

| First guess | Solved within 6 | Average guesses (solved) |
|---|---|---|
| `slate` | 98.79% | 3.82 |
| `salet` | 98.70% | 3.84 |
| **`crane`** | **97.97%** | **3.92** |
| `trace` | 97.84% | 3.90 |
| `adieu` | 97.19% | 4.13 |
| random answer word each game | 97.15% | 4.12 |
| `fuzzy` (deliberately poor) | 94.43% | 4.60 |

Under the current next-guess strategy `crane` and `slate` both solve 99.57%, so `crane`
stayed. It follows a widely shared Wordle tip rather than an original finding. See
[decisions.md](decisions.md#first-guess-is-crane).

## Strategy benchmark

Measured 2026-09-14.

- The distinct-partition heuristic moved the answer-list rate from 97.97% to 99.57% and
  the average from 3.92 to 3.55 guesses, over "first remaining candidate".
- Integer feedback codes are about 6.5× faster than arrays of strings and play exactly the
  same games.
- Allowing any answer-list word as a probe reached 100% on a sample but made `npm test`
  take several minutes and each browser pick up to half a second. Rejected.

See [decisions.md](decisions.md#next-guess-strategy) for the decisions these measurements
settled.
