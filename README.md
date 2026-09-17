# Wordle Trial

A Next.js app that automatically plays the Votee Wordle API's `/random` puzzle. Click **Solve** and watch it guess the word row by row, using each guess's feedback to pick the next one.

## Setup

Requires Node.js `>=20.9.0`.

```bash
npm install
npm run dev
```

Open `http://localhost:3000` and click **Solve**. No `.env` file is required to install, run, test, or build.

## Verification

```bash
npm test         # run the full test suite (offline, no network required)
npm run lint      # run ESLint
npm run build     # production build
```

To run a single test file or a single test by name:

```bash
npm test -- tests/solver.test.ts
npm test -- tests/solver.test.ts -t "name substring"
```

## Configuration

| Variable | Required | Default | Notes |
|---|---|---|---|
| `VOTEE_API_URL` | No | `https://wordle.votee.dev:8000` | Host of the Votee Wordle API. Server-side only. Must be an `http(s)` URL; any other value throws when a guess is made. |

Copy `.env.example` to `.env` and set `VOTEE_API_URL` only if you need to point at a different host — the built-in default works out of the box.
