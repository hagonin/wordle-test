import { NextResponse } from "next/server";
import { guessRandom, VoteeHttpError } from "../../../lib/votee-api";
import { clientIp, createRateLimiter } from "../../../lib/rate-limit";

const WORD_PATTERN = /^[a-z]{5}$/;
const MIN_SEED = 0;
const MAX_SEED = 4_294_967_295;
const MAX_BODY_BYTES = 2048;

const limiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

async function readJsonBody(request: Request): Promise<unknown> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return null;
  }
  if (text.length > MAX_BODY_BYTES) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function invalidRequest(): Response {
  return NextResponse.json({ error: "Invalid guess request" }, { status: 400 });
}

export async function POST(request: Request): Promise<Response> {
  const limit = limiter.check(clientIp(request.headers));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many guesses. Try again in ${limit.retryAfterSeconds} seconds.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const body = await readJsonBody(request);
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return invalidRequest();
  }

  const { word, seed } = body as Record<string, unknown>;
  if (typeof word !== "string" || !WORD_PATTERN.test(word)) {
    return invalidRequest();
  }
  if (
    typeof seed !== "number" ||
    !Number.isSafeInteger(seed) ||
    seed < MIN_SEED ||
    seed > MAX_SEED
  ) {
    return invalidRequest();
  }

  try {
    const feedback = await guessRandom(word, seed);
    return NextResponse.json({ feedback }, { status: 200 });
  } catch (error) {
    console.error("guess failed", { word, seed, error });

    if (error instanceof VoteeHttpError) {
      if (error.status === 429) {
        return NextResponse.json(
          { error: "The Wordle API is busy right now — try again in a moment." },
          { status: 502 },
        );
      }
      if (error.status >= 400 && error.status <= 499) {
        return NextResponse.json({ error: "The Wordle API rejected the guess" }, { status: 502 });
      }
    }

    return NextResponse.json({ error: "Could not reach the Wordle API" }, { status: 502 });
  }
}
