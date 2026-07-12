import { NextRequest, NextResponse } from "next/server";
import type { LyricResult } from "@/lib/use-lyrics";
import {
  fetchMusixmatch,
  fetchLyricsPlus,
  fetchLRCLIB,
  checkRateLimit,
} from "@/lib/lyrics-fetchers";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const artist = searchParams.get("artist") || "";
  const title = searchParams.get("title") || "";
  const album = searchParams.get("album") || "";
  const sources = (searchParams.get("sources") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const sourceOverride = searchParams.get("source");
  const typePref = searchParams.get("type") || "sync";

  if (!artist || !title) {
    return NextResponse.json(
      { error: "missing artist/title" },
      { status: 400 },
    );
  }

  if (sources.includes("musixmatch") && !checkRateLimit(artist, title, album)) {
    return NextResponse.json({ error: "rate limit exceeded" }, { status: 429 });
  }

  const promises: Promise<{
    result: LyricResult | null;
    sourceName: string;
  }>[] = [];

  const addMusixmatch = () => {
    promises.push(
      fetchMusixmatch(artist, title, typePref, album).then((r) => ({
        result: r,
        sourceName: "musixmatch",
      })),
    );
  };

  const addLyricsPlus = () => {
    promises.push(
      fetchLyricsPlus(artist, title, album).then((r) => ({
        result: r,
        sourceName: "lyricsplus",
      })),
    );
  };

  const addLRCLIB = () => {
    promises.push(
      fetchLRCLIB(artist, title, album).then((r) => ({
        result: r,
        sourceName: "lrclib",
      })),
    );
  };

  if (sourceOverride) {
    if (sourceOverride === "musixmatch") addMusixmatch();
    else if (sourceOverride === "lyricsplus") addLyricsPlus();
    else if (sourceOverride === "lrclib") addLRCLIB();
  } else {
    if (sources.includes("musixmatch")) addMusixmatch();
    if (sources.includes("lyricsplus")) addLyricsPlus();
    if (sources.includes("lrclib")) addLRCLIB();
  }

  const settled = await Promise.allSettled(promises);
  const collected: (LyricResult & { source: string })[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled" && s.value.result) {
      collected.push({ ...s.value.result, source: s.value.sourceName });
    }
  }

  function selectBest(
    results: (LyricResult & { source: string })[],
    typePreference: string,
  ): LyricResult | null {
    if (results.length === 0) return null;
    const typeOrder: Record<string, number> = { word: 3, line: 2, static: 1 };
    const preferredType =
      typePreference === "word"
        ? "word"
        : typePreference === "line"
          ? "static"
          : "line";
    const exact = results.filter((r) => r.type === preferredType);
    if (exact.length > 0) return exact[0];
    return results.sort(
      (a, b) => (typeOrder[b.type] || 0) - (typeOrder[a.type] || 0),
    )[0];
  }

  const best = selectBest(collected, typePref);
  if (!best) {
    return NextResponse.json({
      lyrics: [],
      writers: "",
      type: "--",
      source: "none",
    });
  }

  return NextResponse.json(best);
}
