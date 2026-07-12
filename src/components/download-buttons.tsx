"use client";

import { useState } from "react";
import {
  generateLRC,
  generateJSON,
  generateTXT,
  generateTTML,
} from "@/lib/download-utils";
import type { LyricLine } from "@/lib/use-lyrics";

export default function DownloadButtons({
  lyrics,
  metadata,
}: {
  lyrics: LyricLine[];
  metadata: { artist: string; title: string; album?: string };
}) {
  const [fetchingTTML, setFetchingTTML] = useState(false);

  const download = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleTTML = async () => {
    setFetchingTTML(true);
    try {
      const params = new URLSearchParams({
        artist: metadata.artist,
        title: metadata.title,
        album: metadata.album || "",
      });
      const res = await fetch(`/api/ttml?${params.toString()}`);
      if (!res.ok) throw new Error();
      const ttml = await res.text();
      download(
        `${metadata.artist} - ${metadata.title}.ttml`,
        ttml,
        "application/xml+ttml",
      );
    } catch {
      alert("Could not retrieve TTML.");
    } finally {
      setFetchingTTML(false);
    }
  };

  const baseName = `${metadata.artist} - ${metadata.title}`;

  return (
    <div>
      <p className="text-[10px] text-text-faint font-mono uppercase tracking-widest mb-4">
        download lyrics
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button
          onClick={() =>
            download(
              `${baseName}.lrc`,
              generateLRC(lyrics, metadata),
              "text/plain",
            )
          }
          className="px-4 py-3 border border-border bg-card hover:bg-card-hover text-text-muted hover:text-text font-mono text-xs transition-colors duration-500"
        >
          LRC
        </button>
        <button
          onClick={() =>
            download(
              `${baseName}.json`,
              generateJSON(lyrics, metadata),
              "application/json",
            )
          }
          className="px-4 py-3 border border-border bg-card hover:bg-card-hover text-text-muted hover:text-text font-mono text-xs transition-colors duration-500"
        >
          JSON
        </button>
        <button
          onClick={() =>
            download(`${baseName}.txt`, generateTXT(lyrics), "text/plain")
          }
          className="px-4 py-3 border border-border bg-card hover:bg-card-hover text-text-muted hover:text-text font-mono text-xs transition-colors duration-500"
        >
          TXT
        </button>
        <button
          onClick={() =>
            download(
              `${baseName}.ttml`,
              generateTTML(lyrics, metadata),
              "application/xml+ttml",
            )
          }
          className="px-4 py-3 border border-border bg-card hover:bg-card-hover text-text-muted hover:text-text font-mono text-xs transition-colors duration-500"
        >
          TTML
        </button>
      </div>
    </div>
  );
}
