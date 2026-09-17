# Overview

What the project is for, what it deliberately leaves out, and the words it uses. For how the code is laid out, see [architecture.md](architecture.md); for why it is built this way, see [decisions.md](decisions.md); for the solver algorithm, complexity, and design patterns, see [technical-analysis.md](technical-analysis.md).

## Purpose

A Next.js app that plays the Votee Wordle API's `/random` puzzle on its own and wins in at most 6 guesses for nearly every word. Clicking **Solve** starts a game the viewer can watch row by row.

## Task interpretation

The brief asks for "a program that automatically guesses random words". The API documentation describes `GET /random` as "Guess against a random word", so "random words" is read as **the secret word the API picks at random**, not as guesses chosen at random. The project is therefore an automated client for that puzzle: it keeps one seed for the whole game so every guess targets the same word, and it uses each guess's feedback to choose the next one.

The brief fixes no language, interface, endpoint, word size or success target. The web page, the 5-letter `/random` mode, the offline tests and the measured solve rates are this project's own choices.

## Scope

In scope: 5-letter words, the `/random` endpoint with a seed, a watchable browser game, and an offline test suite with a stubbed API.

Not in scope:

- Other word sizes and the `/daily` and `/word/{word}` endpoints.
- A manual play mode, a cancel button, a database, or server-side streaming.
- Automated UI tests; the page is checked by hand.
- A shared rate-limit store, a Content-Security-Policy with nonces, analytics or error tracking.

## Terminology

- **Seed**: the number sent with every `/random` call. The same seed always selects the same secret word, so one seed identifies one game.
- **Slot**: one letter position in the API's reply. The API returns slots unordered; the client sorts them.
- **Feedback**: the per-letter result for a guess: `correct` (green), `present` (yellow) or `absent` (grey).
- **Naive scoring**: the Votee API's yellow rule, which marks a letter `present` wherever it appears in the word without counting repeats. See [decisions.md](decisions.md#the-solver-copies-the-apis-naive-scoring).
- **Answer list / allowed-guesses list**: the two bundled word lists. The answer list is tried first; the allowed-guesses list is only reached when no answer-list word fits.
- **Candidates**: the words still consistent with every piece of feedback so far.
- **Stop reason**: why a game ended: `solved`, `out-of-guesses` or `no-candidates`. The page explains the two non-winning reasons.

## Known limitations

- A word the API picks that is in neither bundled list can never be solved. The API does not publish its dictionary. The solver ends with `no-candidates` instead of throwing; `sioux` (seed `143462397`) is a confirmed example.
- A few answer-list words are still lost to the chosen strategy; `tests/solver.test.ts` (the "reports out-of-guesses for watch" case) pins one of them. The faster-but-complete alternative was rejected; see [decisions.md](decisions.md#next-guess-strategy).

