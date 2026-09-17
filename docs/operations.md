# Operations

Configuration, runtime behaviour worth knowing before hosting the app, and quirks of the Votee API that code cannot show. Commands live in [package.json](../package.json) `scripts`.

## Requirements

Node version: see `engines` in [package.json](../package.json). No `.env` file is needed to install, test, build or run.

## Configuration

- `VOTEE_API_URL` (optional, server only): host of the Votee Wordle API. The default is `DEFAULT_VOTEE_API_URL` in [src/lib/config.ts](../src/lib/config.ts), also shown in [.env.example](../.env.example). The value must be an http(s) URL; anything else throws when a guess is made. It is not a secret.

## Rate limit

`POST /api/guess` is limited per client IP; the limit and window are set where `limiter` is created in [src/app/api/guess/route.ts](../src/app/api/guess/route.ts). A client over the limit gets `429` with a `Retry-After` header.

Behaviour to keep in mind when hosting:

- **Counts are per server instance.** On Vercel, each serverless instance keeps its own count and a cold start resets it, so under load the effective limit can be higher than configured.
- **The client IP comes from `x-forwarded-for`**, falling back to `x-real-ip`. Vercel sets these to the real client IP. Behind a different proxy, or with no proxy, a client can spoof them.
- **When the limiter's memory is full** (`maxKeys` in [src/lib/rate-limit.ts](../src/lib/rate-limit.ts)), expired entries are dropped first, then the oldest. A flood of new IPs can reset an older client's count rather than lock out new visitors. See [decisions.md](decisions.md#rate-limit-30-guesses-per-60-s-per-ip-in-memory).

## Votee API quirks

- Yellows ignore letter counts; see [decisions.md](decisions.md#the-solver-copies-the-apis-naive-scoring).
- `/random` without a `seed` picks a new word on every call; the same seed always gives the same word.
- Non-words are accepted as guesses (`zzzzz` returns five slots). A guess of the wrong length returns `400` with a plain-text body.
- Error formats are inconsistent: `400` plain text for bad input, `422` JSON for a missing parameter, and `500` for `size=0`.
- The API does not publish its word list, and it picks words outside the bundled answer list (see [overview.md](overview.md#measured-results)).
- Calls time out after 10 s (`guessRandom` in [src/lib/votee-api.ts](../src/lib/votee-api.ts)); a timeout reaches the page as "Could not reach the Wordle API".

## Deployment

The target host is Vercel, which detects Next.js without a config file. CI and deployment are not set up yet
