import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../src/app/api/guess/route";
import { slotsReply } from "./helpers/slots";

let ipCounter = 0;
function freshIp(): string {
  ipCounter += 1;
  return `10.0.0.${ipCounter}`;
}

function makeRequest(body: unknown, ip: string): Request {
  return new Request("http://localhost/api/guess", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/guess", () => {
  it("returns sorted feedback and forwards guess/size/seed to the upstream URL", async () => {
    const results = ["correct", "present", "absent", "present", "correct"];
    const fetchMock = vi.fn(async () => slotsReply("crane", results, [4, 0, 3, 1, 2]));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(makeRequest({ word: "crane", seed: 42 }, freshIp()));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ feedback: results });

    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    const parsed = new URL(url);
    expect(parsed.searchParams.get("guess")).toBe("crane");
    expect(parsed.searchParams.get("size")).toBe("5");
    expect(parsed.searchParams.get("seed")).toBe("42");
  });

  it("returns 429 with Retry-After after 30 requests from one IP, and does not affect other IPs", async () => {
    const results = ["correct", "correct", "correct", "correct", "correct"];
    const fetchMock = vi.fn(async () => slotsReply("crane", results));
    vi.stubGlobal("fetch", fetchMock);

    const limitedIp = freshIp();
    for (let i = 0; i < 30; i += 1) {
      const response = await POST(makeRequest({ word: "crane", seed: 1 }, limitedIp));
      expect(response.status).toBe(200);
    }

    fetchMock.mockClear();
    const refused = await POST(makeRequest({ word: "crane", seed: 1 }, limitedIp));
    const refusedBody = await refused.json();

    expect(refused.status).toBe(429);
    const retryAfter = Number(refused.headers.get("Retry-After"));
    expect(Number.isFinite(retryAfter)).toBe(true);
    expect(refusedBody).toEqual({
      error: `Too many guesses. Try again in ${retryAfter} seconds.`,
    });
    expect(fetchMock).not.toHaveBeenCalled();

    const otherIp = freshIp();
    const otherResponse = await POST(makeRequest({ word: "crane", seed: 1 }, otherIp));
    expect(otherResponse.status).toBe(200);
  });

  const invalidCases: Array<[string, unknown]> = [
    ["a missing body", undefined],
    ["a non-JSON body", "not json"],
    ["a JSON null body", "null"],
    ["a JSON array body", "[]"],
    ["a JSON number body", "7"],
    ["an uppercase word", { word: "CRANE", seed: 1 }],
    ["a 4-letter word", { word: "cran", seed: 1 }],
    ["a 6-letter word", { word: "cranes", seed: 1 }],
    ["a word containing a digit", { word: "cra1e", seed: 1 }],
    ["a word containing a hyphen", { word: "cra-e", seed: 1 }],
    ["a seed as a string", { word: "crane", seed: "1" }],
    ["a fractional seed", { word: "crane", seed: 1.5 }],
    ["a negative seed", { word: "crane", seed: -1 }],
    ["a NaN seed", { word: "crane", seed: Number.NaN }],
    ["a seed over the maximum", { word: "crane", seed: 4294967296 }],
    ["an oversized body", { word: "crane", seed: 1, padding: "x".repeat(3000) }],
  ];

  it.each(invalidCases)("rejects %s with 400 and never calls fetch", async (_name, body) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const request =
      body === undefined
        ? new Request("http://localhost/api/guess", {
            method: "POST",
            headers: { "x-forwarded-for": freshIp() },
          })
        : makeRequest(body, freshIp());

    const response = await POST(request);
    const responseBody = await response.json();

    expect(response.status).toBe(400);
    expect(responseBody).toEqual({ error: "Invalid guess request" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts the maximum allowed seed", async () => {
    const results = ["correct", "correct", "correct", "correct", "correct"];
    const fetchMock = vi.fn(async () => slotsReply("crane", results));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(makeRequest({ word: "crane", seed: 4294967295 }, freshIp()));

    expect(response.status).toBe(200);
  });

  it("returns 502 when upstream fails, without leaking upstream text", async () => {
    const secret = "internal-stack-trace-do-not-leak";
    const fetchMock = vi.fn(async () => new Response(secret, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(makeRequest({ word: "crane", seed: 1 }, freshIp()));
    const body = await response.json();
    const text = JSON.stringify(body);

    expect(response.status).toBe(502);
    expect(text).not.toContain(secret);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns 502 with a rejection message for an upstream 4xx", async () => {
    const fetchMock = vi.fn(async () => new Response("bad request", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(makeRequest({ word: "crane", seed: 1 }, freshIp()));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({ error: "The Wordle API rejected the guess" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns 502 with a distinct message when upstream rate-limits us with a 429", async () => {
    const fetchMock = vi.fn(async () => new Response("rate limited", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(makeRequest({ word: "crane", seed: 1 }, freshIp()));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({
      error: "The Wordle API is busy right now — try again in a moment.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns 502 with the generic message when fetch itself rejects", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(makeRequest({ word: "crane", seed: 1 }, freshIp()));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({ error: "Could not reach the Wordle API" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns 502 with the generic message for a structurally invalid 200 reply", async () => {
    const fetchMock = vi.fn(async () => new Response("not json", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(makeRequest({ word: "crane", seed: 1 }, freshIp()));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({ error: "Could not reach the Wordle API" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
