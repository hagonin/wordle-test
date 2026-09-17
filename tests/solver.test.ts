import { describe, expect, it } from "vitest";
import { score, solve, MAX_GUESSES } from "../src/lib/solver";
import { MAX_GUESSES as CONSTANTS_MAX_GUESSES } from "../src/lib/constants";
import { WORDS } from "../src/lib/words";
import { ALLOWED_GUESSES } from "../src/lib/allowed-guesses";

const MIN_SOLVE_RATE = 0.99;
const MAX_AVERAGE_GUESSES = 3.65;
const MIN_ALLOWED_SOLVE_RATE = 0.85;

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

describe("solve", () => {
  it("solves a known answer within 6 guesses, starting with crane", async () => {
    const result = await solve(fakeGuess("apple"));
    expect(result.solved).toBe(true);
    expect(result.guesses.length).toBeLessThanOrEqual(MAX_GUESSES);
    expect(result.guesses[0].word).toBe("crane");
    expect(result.guesses[result.guesses.length - 1].word).toBe("apple");
  });

  it("picks the next guess that splits the remaining candidates most", async () => {
    // After "crane", all five non-opener words give the same feedback against
    // "quack" and all remain candidates. Scored against those five, the distinct
    // feedback-pattern counts are: aback 4, black 5, flack 4, quack 3, scald 3 —
    // so "black" is the unique winner (verified with a one-off script, 2026-09-14).
    const result = await solve(fakeGuess("quack"), [
      "crane",
      "aback",
      "black",
      "flack",
      "quack",
      "scald",
    ]);
    expect(result.guesses.map((g) => g.word)).toEqual(["crane", "black", "quack"]);
  });

  it("plays the same game twice for the same answer", async () => {
    const first = await solve(fakeGuess("apple"));
    const second = await solve(fakeGuess("apple"));
    expect(second.guesses.map((g) => g.word)).toEqual(first.guesses.map((g) => g.word));
  });
});

describe("stop reason", () => {
  it("reports solved for a known answer", async () => {
    const result = await solve(fakeGuess("apple"));
    expect(result.solved).toBe(true);
    expect(result.reason).toBe("solved");
  });

  it("does not solve or throw when the answer is missing from the list", async () => {
    await expect(solve(fakeGuess("zzzzz"))).resolves.toMatchObject({ solved: false });
  });

  it("reports no-candidates when the answer is missing and for an all-absent fake", async () => {
    const missing = await solve(fakeGuess("zzzzz"));
    expect(missing.reason).toBe("no-candidates");
    expect(missing.guesses.length).toBeLessThan(MAX_GUESSES);

    const allAbsent = await solve(() =>
      Promise.resolve(["absent", "absent", "absent", "absent", "absent"] as const),
    );
    expect(allAbsent.reason).toBe("no-candidates");
    expect(allAbsent.guesses.length).toBeLessThan(MAX_GUESSES);
  });

  it("reports solved with a custom word list", async () => {
    const result = await solve(fakeGuess("dogma"), ["crane", "dogma"]);
    expect(result.solved).toBe(true);
    expect(result.reason).toBe("solved");
  });

  it("reports no-candidates for sioux", async () => {
    // Live seed 143462397 — "sioux" is in neither bundled word list.
    const result = await solve(fakeGuess("sioux"));
    expect(result.solved).toBe(false);
    expect(result.reason).toBe("no-candidates");
    expect(result.guesses.map((g) => g.word)).toEqual(["crane", "hoist", "spoil"]);
  });

  it("reports out-of-guesses for watch", async () => {
    const result = await solve(fakeGuess("watch"));
    expect(result.solved).toBe(false);
    expect(result.reason).toBe("out-of-guesses");
    expect(result.guesses.length).toBe(6);
  });
});

describe("constants", () => {
  it("MAX_GUESSES matches between solver and constants", () => {
    expect(MAX_GUESSES).toBe(6);
    expect(CONSTANTS_MAX_GUESSES).toBe(6);
    expect(MAX_GUESSES).toBe(CONSTANTS_MAX_GUESSES);
  });
});

describe("fitness", () => {
  it("solves at least 99% of the word list", async () => {
    let solved = 0;
    let totalGuessesForSolved = 0;

    for (const answer of WORDS) {
      const result = await solve(fakeGuess(answer));
      if (result.solved) {
        solved += 1;
        totalGuessesForSolved += result.guesses.length;
      }
    }

    const rate = solved / WORDS.length;
    const averageGuesses = totalGuessesForSolved / solved;
    console.log(
      `answer-list solve rate: ${(rate * 100).toFixed(2)}%, average guesses: ${averageGuesses.toFixed(2)}`,
    );

    expect(rate).toBeGreaterThanOrEqual(MIN_SOLVE_RATE);
    expect(averageGuesses).toBeLessThanOrEqual(MAX_AVERAGE_GUESSES);
    expect(solved).toBe(2305);
    expect(totalGuessesForSolved).toBe(8188);
  }, 120_000);

  it("solves at least 85% of a sample of allowed-guesses words", async () => {
    const sample = ALLOWED_GUESSES.filter((_, i) => i % 10 === 0);
    let solved = 0;
    let totalGuessesForSolved = 0;

    for (const answer of sample) {
      const result = await solve(fakeGuess(answer));
      if (result.solved) {
        solved += 1;
        totalGuessesForSolved += result.guesses.length;
      }
    }

    const rate = solved / sample.length;
    console.log(`allowed-guesses sample solve rate: ${(rate * 100).toFixed(2)}%`);

    expect(rate).toBeGreaterThanOrEqual(MIN_ALLOWED_SOLVE_RATE);
    expect(solved).toBe(943);
    expect(totalGuessesForSolved).toBe(4411);
  }, 120_000);

  it("solves gazer, grave, graze, patch and poker within 6 guesses", async () => {
    for (const answer of ["gazer", "grave", "graze", "patch", "poker"]) {
      const result = await solve(fakeGuess(answer));
      expect(result.solved).toBe(true);
      expect(result.guesses.length).toBeLessThanOrEqual(MAX_GUESSES);
    }
  });
});
