import { describe, expect, it, vi } from "vitest";
import { postGuess } from "../src/lib/guess-client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("postGuess", () => {
  it("sends POST to /api/guess with the JSON body", async () => {
    const feedback = ["correct", "correct", "correct", "correct", "correct"];
    const fetchMock = vi.fn(async () => jsonResponse({ feedback }));

    await postGuess("crane", 42, fetchMock);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/guess");
    expect(options.method).toBe("POST");
    expect(options.body).toBe(JSON.stringify({ word: "crane", seed: 42 }));
    expect((options.headers as Record<string, string>)["content-type"]).toBe("application/json");
  });

  it("returns the feedback on a valid 200 reply", async () => {
    const feedback = ["correct", "present", "absent", "present", "correct"];
    const fetchMock = vi.fn(async () => jsonResponse({ feedback }));

    const result = await postGuess("crane", 1, fetchMock);

    expect(result).toEqual(feedback);
  });

  it("throws the server's error message on a non-ok JSON reply", async () => {
    const fetchMock = vi.fn(
      async () => jsonResponse({ error: "Too many guesses. Try again in 12 seconds." }, 429),
    );

    await expect(postGuess("crane", 1, fetchMock)).rejects.toThrow(
      "Too many guesses. Try again in 12 seconds.",
    );
  });

  it.each([{}, { error: "" }, { error: 7 }])(
    "throws Something went wrong on a non-ok JSON reply with no usable error (%j)",
    async (body) => {
      const fetchMock = vi.fn(async () => jsonResponse(body, 502));

      await expect(postGuess("crane", 1, fetchMock)).rejects.toThrow("Something went wrong");
    },
  );

  it("throws Could not reach the solver when the body fails to parse as JSON", async () => {
    const fetchMock = vi.fn(async () => new Response("not json", { status: 200 }));

    await expect(postGuess("crane", 1, fetchMock)).rejects.toThrow("Could not reach the solver");
  });

  it("throws Could not reach the solver when fetch rejects", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });

    await expect(postGuess("crane", 1, fetchMock)).rejects.toThrow("Could not reach the solver");
  });

  const invalidFeedbackCases: Array<[string, unknown]> = [
    ["absent", { notFeedback: true }],
    ["a string", { feedback: "correct" }],
    ["empty", { feedback: [] }],
    ["length 4", { feedback: ["correct", "present", "absent", "present"] }],
    [
      "length 6",
      { feedback: ["correct", "present", "absent", "present", "correct", "absent"] },
    ],
    [
      "containing an invalid value",
      { feedback: ["correct", "present", "maybe", "present", "correct"] },
    ],
    ["containing a number", { feedback: ["correct", "present", 1, "present", "correct"] }],
    ["containing null", { feedback: ["correct", "present", null, "present", "correct"] }],
    ["a body that is not an object", "not-an-object"],
  ];

  it.each(invalidFeedbackCases)(
    "throws when the feedback isn't a valid 5-result array (%s)",
    async (_name, body) => {
      const fetchMock = vi.fn(async () =>
        typeof body === "string"
          ? new Response(JSON.stringify(body), { status: 200 })
          : jsonResponse(body),
      );

      await expect(postGuess("crane", 1, fetchMock)).rejects.toThrow(
        "The solver returned an invalid reply",
      );
    },
  );
});
