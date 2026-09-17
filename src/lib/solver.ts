import { WORDS } from "./words";
import { ALLOWED_GUESSES } from "./allowed-guesses";
import { MAX_GUESSES } from "./constants";

export type Result = "correct" | "present" | "absent";
export type Guess = { word: string; feedback: Result[] };
export type StopReason = "solved" | "out-of-guesses" | "no-candidates";
export type SolveResult = { solved: boolean; reason: StopReason; guesses: Guess[] };
export type GuessFn = (word: string) => Promise<Result[]>;

const DIGIT_WEIGHTS = [1, 3, 9, 27, 81];
const DIGIT_TO_RESULT: Result[] = ["absent", "present", "correct"];

function scoreCode(answer: string, guess: string): number {
  let code = 0;
  for (let i = 0; i < 5; i++) {
    const digit = answer[i] === guess[i] ? 2 : answer.includes(guess[i]) ? 1 : 0;
    code += digit * DIGIT_WEIGHTS[i];
  }
  return code;
}

function resultsToCode(results: Result[]): number {
  let code = 0;
  for (let i = 0; i < 5; i++) {
    const digit = results[i] === "correct" ? 2 : results[i] === "present" ? 1 : 0;
    code += digit * DIGIT_WEIGHTS[i];
  }
  return code;
}

export function score(answer: string, guess: string): Result[] {
  const code = scoreCode(answer, guess);
  const results: Result[] = [];
  let remainder = code;
  for (let i = 0; i < 5; i++) {
    const digit = Math.floor(remainder / DIGIT_WEIGHTS[i]) % 3;
    results.push(DIGIT_TO_RESULT[digit]);
  }
  return results;
}

const DEFAULT_POOL: readonly string[] = [...WORDS, ...ALLOWED_GUESSES];
const WORDS_SET = new Set(WORDS);

function selectPool(candidates: readonly string[]): readonly string[] {
  const answerListSurvivors = candidates.filter((word) => WORDS_SET.has(word));
  return answerListSurvivors.length > 0 ? answerListSurvivors : candidates;
}

export async function solve(
  guess: GuessFn,
  words: readonly string[] = DEFAULT_POOL,
): Promise<SolveResult> {
  let candidates: readonly string[] = words;
  let nextWord = "crane";
  const guesses: Guess[] = [];

  for (let attempt = 0; attempt < MAX_GUESSES; attempt++) {
    const feedback = await guess(nextWord);
    guesses.push({ word: nextWord, feedback });

    if (feedback.every((result) => result === "correct")) {
      return { solved: true, reason: "solved", guesses };
    }

    const code = resultsToCode(feedback);
    candidates = candidates.filter((candidate) => scoreCode(candidate, nextWord) === code);

    if (candidates.length === 0) {
      return { solved: false, reason: "no-candidates", guesses };
    }

    const pool = selectPool(candidates);
    nextWord = pool[0];
  }

  return { solved: false, reason: "out-of-guesses", guesses };
}

export { MAX_GUESSES };
