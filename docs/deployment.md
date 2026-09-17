# Deployment

## Platform

Vercel — https://vercel.com/fepjs-projects/wordle-trial

## Production URL

https://wordle-trial-iota.vercel.app

## Deploy Command

```bash
vercel --prod
```

No `vercel.json` is used — Vercel auto-detects Next.js and runs `npm run build`. See
[operations.md](operations.md#requirements) for the Node version requirement.

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `VOTEE_API_URL` | Host of the Votee Wordle API. Defaults to `DEFAULT_VOTEE_API_URL` in [src/lib/config.ts](../src/lib/config.ts) when unset. | No |

No `.env` file or environment variables are needed for a working deployment. See
[operations.md](operations.md#configuration) for the full behavior.

## Custom Domain

Not configured. Add one from the Vercel dashboard's Domains tab for this project when needed.

## Rollback

```bash
vercel rollback [deployment-url]
```

## Troubleshooting

- **Cold-start rate-limit resets**: the per-IP limiter is in-process (see
  [operations.md](operations.md#rate-limit)); each serverless instance keeps its own count,
  so a cold start resets it. This is documented, accepted behavior, not a deployment defect.
- **502 "Could not reach the Wordle API"**: the upstream Votee API is unreachable or erroring;
  not a deployment issue. See [decisions.md](decisions.md#upstream-rejections-return-502).
