import { afterEach, describe, expect, it, vi } from "vitest";
import { guessRandom, VoteeHttpError } from "../src/lib/votee-api";
import { slotsReply } from "./helpers/slots";

const RESULTS_ALL_CORRECT = ["correct", "correct", "correct", "correct", "correct"];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.VOTEE_API_URL;
});

describe("guessRandom", () => {
  it("requests the right URL and options", async () => {
    const fetchMock = vi.fn(async () => slotsReply("crane", RESULTS_ALL_CORRECT));
    vi.stubGlobal("fetch", fetchMock);
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");

    await guessRandom("crane", 42);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://wordle.votee.dev:8000");
    expect(parsed.pathname).toBe("/random");
    expect(parsed.searchParams.get("guess")).toBe("crane");
    expect(parsed.searchParams.get("size")).toBe("5");
    expect(parsed.searchParams.get("seed")).toBe("42");
    expect(options.cache).toBe("no-store");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(timeoutSpy).toHaveBeenCalledWith(10_000);
  });

  it("forwards a large seed unchanged", async () => {
    const fetchMock = vi.fn(async () => slotsReply("crane", RESULTS_ALL_CORRECT));
    vi.stubGlobal("fetch", fetchMock);

    await guessRandom("crane", 4294967295);

    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(new URL(url).searchParams.get("seed")).toBe("4294967295");
  });

  it("uses VOTEE_API_URL when set", async () => {
    process.env.VOTEE_API_URL = "https://override.test";
    const fetchMock = vi.fn(async () => slotsReply("crane", RESULTS_ALL_CORRECT));
    vi.stubGlobal("fetch", fetchMock);

    await guessRandom("crane", 1);

    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url.startsWith("https://override.test")).toBe(true);
  });

  it("sorts slots returned out of order", async () => {
    const results = ["correct", "present", "absent", "present", "correct"];
    const fetchMock = vi.fn(async () => slotsReply("crane", results, [4, 0, 3, 1, 2]));
    vi.stubGlobal("fetch", fetchMock);

    const feedback = await guessRandom("crane", 1);

    expect(feedback).toEqual(results);
  });

  it("throws a VoteeHttpError whose message contains the status and a body excerpt", async () => {
    const fetchMock = vi.fn(
      async () => new Response("bad request: guess must be 5 letters", { status: 400 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(guessRandom("crane", 1)).rejects.toMatchObject({
      message: expect.stringContaining("400"),
    });
    await expect(guessRandom("crane", 1)).rejects.toMatchObject({
      message: expect.stringContaining("bad request"),
    });
  });

  it("gives a VoteeHttpError with status 400 for a plain-text 400 body", async () => {
    const fetchMock = vi.fn(async () => new Response("bad request", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(guessRandom("crane", 1)).rejects.toBeInstanceOf(VoteeHttpError);
    const fetchMock2 = vi.fn(async () => new Response("bad request", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock2);
    try {
      await guessRandom("crane", 1);
      throw new Error("expected guessRandom to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(VoteeHttpError);
      expect((err as VoteeHttpError).status).toBe(400);
    }
  });

  it("gives a VoteeHttpError with status 500 for a server error", async () => {
    const fetchMock = vi.fn(async () => new Response("internal error", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    try {
      await guessRandom("crane", 1);
      throw new Error("expected guessRandom to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(VoteeHttpError);
      expect((err as VoteeHttpError).status).toBe(500);
    }
  });

  it("throws a plain error naming an invalid reply for a non-JSON 200 body", async () => {
    const fetchMock = vi.fn(async () => new Response("not json", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    try {
      await guessRandom("crane", 1);
      throw new Error("expected guessRandom to throw");
    } catch (err) {
      expect(err).not.toBeInstanceOf(VoteeHttpError);
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toMatch(/invalid reply/i);
    }
  });

  it("rejects a JSON object instead of an array", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ slot: 0 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(guessRandom("crane", 1)).rejects.not.toBeInstanceOf(VoteeHttpError);
    await expect(guessRandom("crane", 1)).rejects.toThrow(/invalid reply/i);
  });

  it("rejects a reply with 4 slots", async () => {
    const results = ["correct", "present", "absent", "present"];
    const fetchMock = vi.fn(async () => slotsReply("crane", results, [0, 1, 2, 3]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(guessRandom("crane", 1)).rejects.toThrow(/invalid reply/i);
  });

  it("rejects a reply with 6 slots", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            { slot: 0, guess: "c", result: "correct" },
            { slot: 1, guess: "r", result: "correct" },
            { slot: 2, guess: "a", result: "correct" },
            { slot: 3, guess: "n", result: "correct" },
            { slot: 4, guess: "e", result: "correct" },
            { slot: 5, guess: "x", result: "correct" },
          ]),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(guessRandom("crane", 1)).rejects.toThrow(/invalid reply/i);
  });

  it("rejects a slot outside 0-4", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            { slot: 0, guess: "c", result: "correct" },
            { slot: 1, guess: "r", result: "correct" },
            { slot: 2, guess: "a", result: "correct" },
            { slot: 3, guess: "n", result: "correct" },
            { slot: 5, guess: "e", result: "correct" },
          ]),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(guessRandom("crane", 1)).rejects.toThrow(/invalid reply/i);
  });

  it("rejects a non-integer slot", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            { slot: 0, guess: "c", result: "correct" },
            { slot: 1, guess: "r", result: "correct" },
            { slot: 2, guess: "a", result: "correct" },
            { slot: 3, guess: "n", result: "correct" },
            { slot: 1.5, guess: "e", result: "correct" },
          ]),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(guessRandom("crane", 1)).rejects.toThrow(/invalid reply/i);
  });

  it("rejects duplicate slots", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            { slot: 0, guess: "c", result: "correct" },
            { slot: 0, guess: "c", result: "correct" },
            { slot: 2, guess: "a", result: "correct" },
            { slot: 3, guess: "n", result: "correct" },
            { slot: 4, guess: "e", result: "correct" },
          ]),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(guessRandom("crane", 1)).rejects.toThrow(/invalid reply/i);
  });

  it("rejects an invalid result value", async () => {
    const fetchMock = vi.fn(
      async () => slotsReply("crane", ["correct", "present", "maybe", "present", "correct"]),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(guessRandom("crane", 1)).rejects.toThrow(/invalid reply/i);
  });

  it("rejects a non-string result", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            { slot: 0, guess: "c", result: "correct" },
            { slot: 1, guess: "r", result: "correct" },
            { slot: 2, guess: "a", result: 7 },
            { slot: 3, guess: "n", result: "correct" },
            { slot: 4, guess: "e", result: "correct" },
          ]),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(guessRandom("crane", 1)).rejects.toThrow(/invalid reply/i);
  });

  it("rejects a guess letter not matching the word at that slot", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            { slot: 0, guess: "x", result: "correct" },
            { slot: 1, guess: "r", result: "correct" },
            { slot: 2, guess: "a", result: "correct" },
            { slot: 3, guess: "n", result: "correct" },
            { slot: 4, guess: "e", result: "correct" },
          ]),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(guessRandom("crane", 1)).rejects.toThrow(/invalid reply/i);
  });

  it("rejects a slot entry that is not an object", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify([null, 1, 2, 3, 4]), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(guessRandom("crane", 1)).rejects.toThrow(/invalid reply/i);
  });

  it("accepts uppercase guess letters", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            { slot: 0, guess: "C", result: "correct" },
            { slot: 1, guess: "R", result: "correct" },
            { slot: 2, guess: "A", result: "correct" },
            { slot: 3, guess: "N", result: "correct" },
            { slot: 4, guess: "E", result: "correct" },
          ]),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const feedback = await guessRandom("crane", 1);

    expect(feedback).toEqual(RESULTS_ALL_CORRECT);
  });
});
