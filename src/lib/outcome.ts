import type { StopReason } from "./solver";
import { MAX_GUESSES } from "./constants";

export function describeOutcome(
  reason: StopReason,
  attempts: number,
): { result: string; detail: string | null } {
  switch (reason) {
    case "solved":
      return { result: `Solved in ${attempts}/${MAX_GUESSES}`, detail: null };
    case "out-of-guesses":
      return {
        result: `Not solved in ${MAX_GUESSES} guesses`,
        detail: "the word was still possible, but the guesses were not enough to narrow it down",
      };
    case "no-candidates":
      return {
        result: "Brain freeze! 🍧 We ran out of words!",
        detail: `Guesses used: ${attempts}/${MAX_GUESSES}`,
      };
  }
}
