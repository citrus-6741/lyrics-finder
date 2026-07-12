import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import {
  generateLRC,
  generateJSON,
  generateTXT,
  generateTTML,
} from "@/lib/download-utils";
import type { LyricResult } from "@/lib/use-lyrics";

export async function POST(request: NextRequest) {
  const { album, tracks, formats } = await request.json();
  if (!album || !tracks || !formats || !Array.isArray(formats)) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const zip = new JSZip();

  for (const track of tracks) {
    const lyrics: LyricResult | null = track.lyrics;
    if (!lyrics || lyrics.lyrics.length === 0) continue;
    const meta = {
      artist: track.artist,
      title: track.title,
      album: album.title,
      writers: lyrics.writers,
    };
    const padTrack = String(track.track || 0).padStart(2, "0");

    if (formats.includes("lrc")) {
      zip.file(
        `${padTrack} - ${track.title}.lrc`,
        generateLRC(lyrics.lyrics, meta),
      );
    }
    if (formats.includes("json")) {
      zip.file(
        `${padTrack} - ${track.title}.json`,
        generateJSON(lyrics.lyrics, meta),
      );
    }
    if (formats.includes("txt")) {
      zip.file(`${padTrack} - ${track.title}.txt`, generateTXT(lyrics.lyrics));
    }
    if (formats.includes("ttml")) {
      zip.file(
        `${padTrack} - ${track.title}.ttml`,
        generateTTML(lyrics.lyrics, meta),
      );
    }
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

  return new NextResponse(new Uint8Array(zipBuffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${album.artist} - ${album.title}.zip"`,
    },
  });
}
