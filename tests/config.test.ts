import { describe, expect, it } from "vitest";
import { MAX_GUESSES, VALID_RESULTS } from "../src/lib/constants";
import { voteeApiUrl } from "../src/lib/config";

describe("constants", () => {
  it("MAX_GUESSES is 6", () => {
    expect(MAX_GUESSES).toBe(6);
  });

  it("VALID_RESULTS has exactly the three result strings", () => {
    expect(VALID_RESULTS).toEqual(["correct", "present", "absent"]);
  });
});

describe("voteeApiUrl", () => {
  it("returns the default when VOTEE_API_URL is unset", () => {
    expect(voteeApiUrl({})).toBe("https://wordle.votee.dev:8000");
  });

  it("returns the default when VOTEE_API_URL is blank", () => {
    expect(voteeApiUrl({ VOTEE_API_URL: "   " })).toBe("https://wordle.votee.dev:8000");
  });

  it("returns a valid http(s) override with no trailing slash", () => {
    expect(voteeApiUrl({ VOTEE_API_URL: "https://example.test/" })).toBe(
      "https://example.test",
    );
    expect(voteeApiUrl({ VOTEE_API_URL: "http://example.test/" })).toBe("http://example.test");
  });

  it.each(["not-a-url", "ftp://example.test", "file:///etc/passwd"])(
    "throws when VOTEE_API_URL is not an http(s) URL (%s)",
    (value) => {
      expect(() => voteeApiUrl({ VOTEE_API_URL: value })).toThrow(
        "VOTEE_API_URL must be an http(s) URL",
      );
    },
  );
});
