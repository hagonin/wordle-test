import { describe, expect, it } from "vitest";
import { MAX_GUESSES } from "../src/lib/constants";
import { describeOutcome } from "../src/lib/outcome";

describe("describeOutcome", () => {
  it("solved", () => {
    expect(describeOutcome("solved", 4)).toEqual({
      result: `Solved in 4/${MAX_GUESSES}`,
      detail: null,
    });
  });

  it("out-of-guesses", () => {
    expect(describeOutcome("out-of-guesses", MAX_GUESSES)).toEqual({
      result: `Not solved in ${MAX_GUESSES} guesses`,
      detail: "the word was still possible, but the guesses were not enough to narrow it down",
    });
  });

  it("no-candidates", () => {
    expect(describeOutcome("no-candidates", 3)).toEqual({
      result: "Brain freeze! 🍧 We ran out of words!",
      detail: `Guesses used: 3/${MAX_GUESSES}`,
    });
  });
});
