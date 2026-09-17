export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

type Window = { count: number; resetAt: number };

const DEFAULT_MAX_KEYS = 10_000;

export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
  now?: () => number;
  maxKeys?: number;
}): { check(key: string): RateLimitResult } {
  const { limit, windowMs, now = Date.now, maxKeys = DEFAULT_MAX_KEYS } = options;
  const windows = new Map<string, Window>();

  function evictIfNeeded(key: string): void {
    if (windows.has(key)) return;
    if (windows.size < maxKeys) return;

    const currentTime = now();
    let victim: string | undefined;
    for (const [candidateKey, window] of windows) {
      if (window.resetAt <= currentTime) {
        victim = candidateKey;
        break;
      }
    }
    if (victim === undefined) {
      victim = windows.keys().next().value;
    }
    if (victim !== undefined) {
      windows.delete(victim);
    }
  }

  return {
    check(key: string): RateLimitResult {
      const currentTime = now();
      let window = windows.get(key);

      if (!window || window.resetAt <= currentTime) {
        evictIfNeeded(key);
        window = { count: 0, resetAt: currentTime + windowMs };
        windows.set(key, window);
      }

      const retryAfterSeconds = Math.max(1, Math.ceil((window.resetAt - currentTime) / 1000));

      if (window.count >= limit) {
        return { allowed: false, remaining: 0, retryAfterSeconds };
      }

      window.count += 1;
      return { allowed: true, remaining: limit - window.count, retryAfterSeconds };
    },
  };
}

export function clientIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor !== null) {
    const firstField = forwardedFor.split(",")[0]?.trim();
    if (firstField) return firstField;
  }

  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return "unknown";
}
