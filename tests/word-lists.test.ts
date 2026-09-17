import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { WORDS } from "../src/lib/words";
import { ALLOWED_GUESSES } from "../src/lib/allowed-guesses";

const WORDS_SHA256 = "6da4f0ac056bc73233fe3de003a00bd512efc0489ce93524397b448ff66f4d11";
const ALLOWED_GUESSES_SHA256 = "57d8ed9dc8aa7eaf24c6e1213e565492b4c6be481e5e7a6e1ea5b05864371299";

describe("WORDS", () => {
  it("has the expected length, shape and endpoints", () => {
    expect(WORDS.length).toBe(2315);
    for (const word of WORDS) {
      expect(word).toMatch(/^[a-z]{5}$/);
    }
    expect(WORDS[0]).toBe("aback");
    expect(WORDS[WORDS.length - 1]).toBe("zonal");
  });

  it("has no duplicates", () => {
    expect(new Set(WORDS).size).toBe(WORDS.length);
  });

  it("matches the pinned checksum", () => {
    const digest = createHash("sha256").update(WORDS.join(" ")).digest("hex");
    expect(digest).toBe(WORDS_SHA256);
  });
});

describe("ALLOWED_GUESSES", () => {
  it("has the expected length, shape and endpoints", () => {
    expect(ALLOWED_GUESSES.length).toBe(10657);
    for (const word of ALLOWED_GUESSES) {
      expect(word).toMatch(/^[a-z]{5}$/);
    }
    expect(ALLOWED_GUESSES[0]).toBe("aahed");
    expect(ALLOWED_GUESSES[ALLOWED_GUESSES.length - 1]).toBe("zymic");
  });

  it("has no duplicates", () => {
    expect(new Set(ALLOWED_GUESSES).size).toBe(ALLOWED_GUESSES.length);
  });

  it("matches the pinned checksum", () => {
    const digest = createHash("sha256").update(ALLOWED_GUESSES.join(" ")).digest("hex");
    expect(digest).toBe(ALLOWED_GUESSES_SHA256);
  });
});

describe("WORDS and ALLOWED_GUESSES", () => {
  it("do not overlap", () => {
    const wordSet = new Set(WORDS);
    const overlap = ALLOWED_GUESSES.filter((word) => wordSet.has(word));
    expect(overlap).toEqual([]);
  });
});
