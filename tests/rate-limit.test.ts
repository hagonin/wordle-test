import { describe, expect, it } from "vitest";
import { clientIp, createRateLimiter } from "../src/lib/rate-limit";

describe("createRateLimiter", () => {
  it("allows the first limit requests for a key, then refuses with retryAfterSeconds at the window length", () => {
    const now = 0;
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => now });

    expect(limiter.check("a")).toMatchObject({ allowed: true, remaining: 2 });
    expect(limiter.check("a")).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.check("a")).toMatchObject({ allowed: true, remaining: 0 });

    const refused = limiter.check("a");
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBe(60);
  });

  it("counts the countdown down and opens a fresh window at resetAt", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => now });

    limiter.check("a");
    const first = limiter.check("a");
    expect(first.allowed).toBe(false);
    expect(first.retryAfterSeconds).toBe(60);

    now = 30_000;
    const partway = limiter.check("a");
    expect(partway.allowed).toBe(false);
    expect(partway.retryAfterSeconds).toBeLessThan(first.retryAfterSeconds);

    now = 59_999;
    const almostExpired = limiter.check("a");
    expect(almostExpired.allowed).toBe(false);
    expect(almostExpired.retryAfterSeconds).toBe(1);

    now = 60_000;
    const freshWindow = limiter.check("a");
    expect(freshWindow.allowed).toBe(true);
    expect(freshWindow.remaining).toBe(0);
  });

  it("keeps keys independent", () => {
    const now = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => now });

    limiter.check("a");
    expect(limiter.check("a").allowed).toBe(false);
    expect(limiter.check("b").allowed).toBe(true);
  });

  it("bounds memory by maxKeys, evicting the oldest key first", () => {
    const now = 0;
    const limiter = createRateLimiter({ limit: 5, windowMs: 60_000, maxKeys: 2, now: () => now });

    limiter.check("first");
    limiter.check("first");
    limiter.check("second");
    limiter.check("third");

    const firstAgain = limiter.check("first");
    expect(firstAgain.remaining).toBe(4);
  });

  it("is bounded when maxKeys is not supplied", () => {
    const now = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => now });

    limiter.check("key-0");
    expect(limiter.check("key-0").allowed).toBe(false);

    for (let i = 1; i <= 10_000; i += 1) {
      limiter.check(`key-${i}`);
    }

    expect(limiter.check("key-0").allowed).toBe(true);
  });

  it("evicts the expired window before the active one when memory is full", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 5, windowMs: 60_000, maxKeys: 2, now: () => now });

    limiter.check("expired");
    now = 70_000;
    limiter.check("active");
    limiter.check("active");

    now = 70_000;
    limiter.check("new-key");

    const activeAgain = limiter.check("active");
    expect(activeAgain.remaining).toBe(2);

    const expiredAgain = limiter.check("expired");
    expect(expiredAgain.remaining).toBe(4);
  });
});

describe("clientIp", () => {
  it("takes the first x-forwarded-for entry, trimmed", () => {
    const headers = new Headers({ "x-forwarded-for": " 203.0.113.7 , 198.51.100.1 " });
    expect(clientIp(headers)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip when the first x-forwarded-for field is blank", () => {
    const headers = new Headers({
      "x-forwarded-for": ", 203.0.113.7",
      "x-real-ip": "198.51.100.9",
    });
    expect(clientIp(headers)).toBe("198.51.100.9");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const headers = new Headers({ "x-real-ip": " 198.51.100.9 " });
    expect(clientIp(headers)).toBe("198.51.100.9");
  });

  it("returns unknown when neither header is present", () => {
    const headers = new Headers();
    expect(clientIp(headers)).toBe("unknown");
  });
});
