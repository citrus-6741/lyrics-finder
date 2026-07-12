import type { LyricResult } from "@/lib/use-lyrics";

const cache = new Map<string, { data: LyricResult; expires: number }>();
const TTL = 30 * 60 * 1000;

export function getCachedLyrics(
  artist: string,
  title: string,
): LyricResult | null {
  const key = `${artist}|||${title}`;
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCachedLyrics(
  artist: string,
  title: string,
  data: LyricResult,
): void {
  const key = `${artist}|||${title}`;
  cache.set(key, { data, expires: Date.now() + TTL });
}

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of cache) {
      if (now > entry.expires) cache.delete(key);
    }
  }, 300_000);
}
