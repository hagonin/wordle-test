import type { Result } from "./solver";
import { VALID_RESULTS } from "./constants";
import { voteeApiUrl } from "./config";

const TIMEOUT_MS = 10_000;
const EXCERPT_LENGTH = 200;
const VALID_RESULT_SET = new Set<string>(VALID_RESULTS);

export class VoteeHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "VoteeHttpError";
    this.status = status;
  }
}

function invalidReply(reason: string): Error {
  return new Error(`Invalid reply from the Wordle API: ${reason}`);
}

function excerpt(text: string): string {
  return text.replace(/[\x00-\x1F\x7F]/g, "").slice(0, EXCERPT_LENGTH);
}

type Slot = { slot: number; guess: string; result: Result };

function parseSlot(entry: unknown, word: string): Slot {
  if (typeof entry !== "object" || entry === null) {
    throw invalidReply("slot entry is not an object");
  }
  const { slot, guess, result } = entry as Record<string, unknown>;

  if (typeof slot !== "number" || !Number.isInteger(slot) || slot < 0 || slot > 4) {
    throw invalidReply("slot is not an integer in range 0-4");
  }
  if (typeof result !== "string" || !VALID_RESULT_SET.has(result)) {
    throw invalidReply("result is not a valid result value");
  }
  if (typeof guess !== "string" || guess.toLowerCase() !== word[slot]?.toLowerCase()) {
    throw invalidReply("guess letter does not match the requested word at that slot");
  }

  return { slot, guess, result: result as Result };
}

export async function guessRandom(word: string, seed: number): Promise<Result[]> {
  const base = voteeApiUrl(process.env);
  const params = new URLSearchParams({ guess: word, size: "5", seed: String(seed) });
  const url = `${base}/random?${params.toString()}`;

  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new VoteeHttpError(response.status, `Votee responded ${response.status}: ${excerpt(text)}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw invalidReply("response body is not valid JSON");
  }

  if (!Array.isArray(data)) {
    throw invalidReply("response body is not an array");
  }
  if (data.length !== 5) {
    throw invalidReply(`expected 5 slots, got ${data.length}`);
  }

  const seen = new Set<number>();
  const slots: Slot[] = [];
  for (const entry of data) {
    const parsed = parseSlot(entry, word);
    if (seen.has(parsed.slot)) {
      throw invalidReply("duplicate slot");
    }
    seen.add(parsed.slot);
    slots.push(parsed);
  }

  return [...slots].sort((a, b) => a.slot - b.slot).map((s) => s.result);
}
