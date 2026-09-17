import { describe, expect, it } from "vitest";
import { score, solve, MAX_GUESSES } from "../src/lib/solver";
import { WORDS } from "../src/lib/words";

function fakeGuess(answer: string) {
  return (word: string) => Promise.resolve(score(answer, word));
}

describe("score", () => {
  it("scores apple vs ppppp", () => {
    expect(score("apple", "ppppp")).toEqual([
      "present",
      "correct",
      "correct",
      "present",
      "present",
    ]);
  });

  it("scores apple vs paper", () => {
    expect(score("apple", "paper")).toEqual([
      "present",
      "present",
      "correct",
      "present",
      "absent",
    ]);
  });
});

describe("candidate elimination", () => {
  const sampleAnswers = ["apple", "crane", "zesty", "shape", "mount"];

  it("never repeats a guess", async () => {
    for (const answer of sampleAnswers) {
      const result = await solve(fakeGuess(answer));
      const guessedWords = result.guesses.map((g) => g.word);
      expect(new Set(guessedWords).size).toBe(guessedWords.length);
    }
  });

  it("never makes more than MAX_GUESSES guesses", async () => {
    for (const answer of sampleAnswers) {
      const result = await solve(fakeGuess(answer));
      expect(result.guesses.length).toBeLessThanOrEqual(MAX_GUESSES);
    }
  });
});

describe("pool selection", () => {
  it("plays answer-list words the same with the default list and an explicit WORDS list", async () => {
    for (const answer of ["apple", "crane", "zesty"]) {
      const withDefault = await solve(fakeGuess(answer));
      const withWords = await solve(fakeGuess(answer), WORDS);
      expect(withDefault.guesses.map((g) => g.word)).toEqual(
        withWords.guesses.map((g) => g.word),
      );
    }
  });

  it("solves aster with the default word list", async () => {
    const result = await solve(fakeGuess("aster"));
    expect(result.solved).toBe(true);
  });

  it("keeps allowed-guesses survivors after picking from the answer list", async () => {
    // "abbey" (WORDS) and "aahed" (ALLOWED_GUESSES-only) score identically against
    // the opener "crane", so both survive round 1 and the answer-list word "abbey"
    // is picked first; "aahed" is the only survivor afterward.
    const result = await solve(fakeGuess("aahed"), ["abbey", "aahed"]);
    expect(result.guesses.map((g) => g.word)).toEqual(["crane", "abbey", "aahed"]);
    expect(result.solved).toBe(true);
  });
});
