export const DEFAULT_VOTEE_API_URL = "https://wordle.votee.dev:8000";

export function voteeApiUrl(env: Record<string, string | undefined>): string {
  const raw = env.VOTEE_API_URL?.trim();
  if (!raw) return DEFAULT_VOTEE_API_URL;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("VOTEE_API_URL must be an http(s) URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("VOTEE_API_URL must be an http(s) URL");
  }

  return raw.replace(/\/$/, "");
}
