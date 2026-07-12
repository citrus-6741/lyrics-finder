import { NextRequest, NextResponse } from "next/server";
import type { LyricResult } from "@/lib/use-lyrics";
import {
  fetchMusixmatch,
  fetchLyricsPlus,
  fetchLRCLIB,
} from "@/lib/lyrics-fetchers";

interface TrackRequest {
  title: string;
  artist: string;
  album?: string;
  duration?: number;
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

async function fetchTrack(
  track: TrackRequest,
  sources: string[],
  typePref: string,
): Promise<LyricResult> {
  const results: (LyricResult & { source: string })[] = [];

  for (const src of sources) {
    let result: LyricResult | null = null;
    if (src === "musixmatch") {
      result = await fetchMusixmatch(
        track.artist,
        track.title,
        typePref,
        track.album,
      );
    } else if (src === "lyricsplus") {
      result = await fetchLyricsPlus(
        track.artist,
        track.title,
        track.album || "",
      );
    } else if (src === "lrclib") {
      result = await fetchLRCLIB(track.artist, track.title, track.album || "");
    }
    if (result) {
      results.push({ ...result, source: src });
    }
  }

  return (
    selectBest(results, typePref) || {
      lyrics: [],
      writers: "",
      type: "static",
      source: "none",
    }
  );
}

export async function POST(request: NextRequest) {
  const { tracks, sources, type } = await request.json();
  if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
    return NextResponse.json({ error: "tracks required" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  let progressSent = 0;
  const total = tracks.length;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: any) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      };

      const results: (LyricResult | null)[] = new Array(total).fill(null);
      const queue = tracks.map((t, i) => ({ ...t, index: i }));
      let active = 0;
      const maxConcurrent = 3;

      const next = () => {
        while (active < maxConcurrent && queue.length > 0) {
          const job = queue.shift()!;
          active++;
          fetchTrack(job, sources, type)
            .then((res) => {
              results[job.index] = res;
              progressSent++;
              send({ progress: { current: progressSent, total } });
            })
            .catch(() => {
              results[job.index] = null;
              progressSent++;
              send({ progress: { current: progressSent, total } });
            })
            .finally(() => {
              active--;
              if (active === 0 && queue.length === 0) {
                send({ done: true, results });
                controller.close();
              } else {
                next();
              }
            });
        }
      };

      if (queue.length === 0) {
        send({ done: true, results });
        controller.close();
      } else {
        next();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
