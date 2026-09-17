import type { Result } from "./solver";
import { VALID_RESULTS } from "./constants";

const VALID_RESULT_SET = new Set<string>(VALID_RESULTS);

function isValidFeedback(value: unknown): value is Result[] {
  return (
    Array.isArray(value) &&
    value.length === 5 &&
    value.every((entry) => typeof entry === "string" && VALID_RESULT_SET.has(entry))
  );
}

export async function postGuess(
  word: string,
  seed: number,
  fetchImpl: typeof fetch = fetch,
): Promise<Result[]> {
  let response: Response;
  try {
    response = await fetchImpl("/api/guess", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ word, seed }),
    });
  } catch {
    throw new Error("Could not reach the solver");
  }

  let data: unknown;
  try {
    const text = await response.text();
    data = JSON.parse(text);
  } catch {
    throw new Error("Could not reach the solver");
  }

  if (!response.ok) {
    const record = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
    const message =
      typeof record.error === "string" && record.error.length > 0
        ? record.error
        : "Something went wrong";
    throw new Error(message);
  }

  const record = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
  if (!isValidFeedback(record.feedback)) {
    throw new Error("The solver returned an invalid reply");
  }

  return record.feedback;
}
