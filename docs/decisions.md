# Decisions

Current decisions, why they were made, and what was rejected. When a decision changes, edit its entry instead of adding a new one; the long-form history is in [plans/](../plans/) and Git.

## The solver copies the API's naive scoring

The Votee API marks yellows without counting letters: `GET /word/apple?guess=ppppp` returns `present, correct, correct, present, present`, although `apple` has one `p`. Real Wordle would mark the extra `p`s `absent`.

The solver's `score()` copies the API's rule exactly. Filtering candidates with real two-pass Wordle scoring would discard the true answer whenever a guess repeats a letter more often than the answer does. The `apple`/`ppppp` case in `tests/solver.test.ts` pins this.

## `/random` with one seed per game

Only `/random` is used, with a seed generated in the browser and kept for the whole game. Without a seed, the API changes the word on every call, so feedback from one guess would not apply to the next.

## The browser runs the solver; the server relays single guesses

An earlier version ran the whole game on the server and returned a finished result. It read as an answer appearing, not as a program playing. The solver now runs in the browser and calls `POST /api/guess` once per guess, with a 600 ms pause between guesses. Calls still go through the server rather than straight to Votee, although CORS is open, so the API host stays a server setting and the proxy can be rate-limited.

## First guess is `crane`

The opener is fixed so games are deterministic. It was checked by playing every answer-list word with each candidate opener (one-off script, 2026-09-14, answer-list words only):

| First guess | Solved within 6 | Average guesses (solved) |
|---|---|---|
| `slate` | 98.79% | 3.82 |
| `salet` | 98.70% | 3.84 |
| **`crane`** | **97.97%** | **3.92** |
| `trace` | 97.84% | 3.90 |
| `adieu` | 97.19% | 4.13 |
| random answer word each game | 97.15% | 4.12 |
| `fuzzy` (deliberately poor) | 94.43% | 4.60 |

Those figures used the earlier "first remaining candidate" strategy. Under the current next-guess strategy, `crane` and `slate` both solve 99.57%, so `crane` stayed. A random opener was rejected: it wins less and would make the same seed play differently, which the tests rely on. Starting with `crane` follows a widely shared Wordle tip rather than an original finding.

## Next-guess strategy

After filtering, the solver picks the remaining candidate (answer-list words first) that splits the other candidates into the most distinct feedback patterns, breaking ties by list order.

- **Chosen over "first remaining candidate":** answer-list solve rate 97.97% → 99.57%, average 3.92 → 3.55 guesses.
- **Rejected: allowing any answer-list word as a guess.** It reached 100% on a sample, but made `npm test` take several minutes and each browser pick take up to half a second.

Scoring uses integer feedback codes instead of arrays of strings. This is about 6.5× faster and plays exactly the same games.

## Two word lists, answer list first

Both lists come from pinned revisions of public gists by cfreshman (URLs in each file's header). The allowed-guesses list was appended after `aster` (seed `584199032`), a word the live API picked that is not in the answer list, stopped the solver after three guesses. Putting the answer list first keeps every answer-list game unchanged.

Rejected for words in neither list: a bigger fallback dictionary and letter probing. Instead, the page explains a `no-candidates` stop.

## API host is optional configuration

`VOTEE_API_URL` overrides the host; when unset the built-in default is used, and a value that is not an http(s) URL fails loudly. A fresh clone must install, test and build without a `.env` file, and the tests never need the network.

## Rate limit: 30 guesses per 60 s per IP, in memory

`POST /api/guess` is a public proxy, so it needs abuse protection before deployment. The limit lives in process memory per server instance.

- **Rejected: a shared store** (Upstash, Vercel KV) or Vercel Firewall rules, as more infrastructure than a single-guess proxy needs. The cost is that each serverless instance counts separately; see [operations.md](operations.md#rate-limit).
- **When the limiter's memory is full**, it drops expired windows first, then the oldest client. Refusing new IPs instead was rejected because a flood would lock out every real new visitor. The trade-off is that a flood can reset an older client's count.
- **The client IP comes from `x-forwarded-for`**, which is trustworthy on Vercel, the chosen host.

## Upstream rejections return 502

When Votee answers a guess with a `4xx`, the route returns `502` with "The Wordle API rejected the guess"; a `5xx`, timeout or network error returns `502` with "Could not reach the Wordle API". The request already passed our own validation, so from the browser's side the fault is upstream, not the client's. Mapping to a `4xx` of our own and retrying failed calls were both rejected.

**Exception: a Votee `429` gets its own message**, `502` with "The Wordle API is busy right now — try again in a moment.", distinct from the generic 4xx rejection message. This is a different upstream failing for a different reason than "your guess was malformed" — Votee itself is rate-limiting the requests our server is relaying, most likely because many players are solving at once. Conflating it with "rejected the guess" reads as if the guess itself was the problem, when the honest answer is "try again shortly". This is unrelated to our own per-IP limiter (which already has this wording for our own `429`) — it is Votee's limiter, not ours, that this covers.

## Hosting and security headers

Hosting is Vercel. A Content-Security-Policy is deferred because Next.js inline scripts need nonces; cheaper baseline headers are planned with CI.

## Testing

The solver, API client, route, limiter, page state and outcome text are tested offline with stubbed `fetch`. The page itself has no automated UI tests and is checked by hand in the browser. The solve-rate thresholds in `tests/solver.test.ts` have little slack on purpose: the solver is deterministic, so the rate moves only when the code or word lists change.
