"use client";

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import LyricsViewer from "@/components/lyrics-viewer";
import DownloadButtons from "@/components/download-buttons";
import type { LyricResult } from "@/lib/use-lyrics";

function LyricsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const artist = searchParams.get("artist") || "";
  const title = searchParams.get("title") || "";
  const album = searchParams.get("album") || "";
  const sourcesParam =
    searchParams.get("sources") || "musixmatch,lyricsplus,lrclib";
  const typeParam = searchParams.get("type") || "sync";

  const [result, setResult] = useState<LyricResult | null>(null);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState("");
  const [selectedSource, setSelectedSource] = useState(
    sourcesParam.split(",")[0] || "",
  );

  const abortRef = useRef<AbortController | null>(null);
  const resultSourceRef = useRef<string | undefined>(undefined);

  const fetchLyrics = useCallback(
    async (sourceOverride?: string) => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (!artist || !title) return;

      setIsFetching(true);
      setError("");

      try {
        const params = new URLSearchParams({
          artist,
          title,
          album,
          type: typeParam,
        });
        if (sourceOverride) {
          params.set("source", sourceOverride);
        } else {
          params.set("sources", sourcesParam);
        }

        const res = await fetch(`/api/search?${params.toString()}`, {
          signal: controller.signal,
        });

        if (!res.ok) {
          if (res.status === 429) setError("rate limit exceeded");
          else setError("failed to fetch lyrics");
          setIsFetching(false);
          return;
        }
        const data: LyricResult = await res.json();
        setResult(data);
        if (data.source && data.source !== "none") {
          setSelectedSource(data.source);
          resultSourceRef.current = data.source;
        }
      } catch (e: any) {
        if (e.name !== "AbortError") {
          setError("network error");
        }
      } finally {
        setIsFetching(false);
      }
    },
    [artist, title, album, typeParam, sourcesParam],
  );

  useEffect(() => {
    fetchLyrics();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchLyrics]);

  const handleSourceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSource = e.target.value;
    setSelectedSource(newSource);
    fetchLyrics(newSource);
  };

  if (!artist || !title) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-text-muted font-mono text-sm">
          missing artist/title
        </p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <button
          onClick={() => router.back()}
          className="text-xs text-text-faint hover:text-text-muted font-mono mb-8 transition-colors"
        >
          ← back
        </button>

        <div className="mb-6 flex flex-col items-center">
          {result?.albumCover && (
            <img
              src={result.albumCover}
              alt=""
              className="w-30 h-30 object-cover mb-3"
            />
          )}
          <h1 className="text-2xl font-light text-text mb-1 text-center">
            {title}
          </h1>
          <p className="text-sm text-text-muted font-mono capitalize">
            {artist}
          </p>
          {album && (
            <p className="text-xs text-text-faint font-mono mt-1">{album}</p>
          )}
        </div>

        <div className="flex items-baseline justify-between mb-10 text-xs font-mono">
          <div className="flex items-baseline gap-4">
            <span className="text-text-faint uppercase tracking-widest">
              source
            </span>
            <select
              value={selectedSource}
              onChange={handleSourceChange}
              className="bg-card border border-border text-text-muted px-2 py-1 focus:outline-none focus:border-text-muted transition-colors uppercase"
            >
              {["musixmatch", "lyricsplus", "lrclib"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <span className="text-text-faint uppercase tracking-widest">
            type: {result?.type || "—"}
          </span>
        </div>

        {isFetching && (
          <div className="flex items-center justify-center py-20">
            <p className="text-sm text-text-muted font-mono animate-pulse">
              fetching lyrics...
            </p>
          </div>
        )}

        {!isFetching && error && (
          <div className="py-20 text-center">
            <p className="text-text-muted font-mono">{error}</p>
          </div>
        )}

        {!isFetching && !error && (!result || result.lyrics.length === 0) && (
          <div className="py-20 text-center">
            <p className="text-text-muted font-mono">no lyrics found</p>
            <p className="text-xs text-text-faint font-mono mt-2">
              tried selected source
            </p>
          </div>
        )}

        {!isFetching && result && result.lyrics.length > 0 && (
          <>
            <LyricsViewer lyrics={result.lyrics} />

            <div className="mt-4 text-center text-xs text-text-faint font-mono">
              {result.writers && <span>writers: {result.writers}</span>}
            </div>

            <div className="mt-12 pt-10 border-t border-border">
              <DownloadButtons
                lyrics={result.lyrics}
                metadata={{ artist, title, album }}
              />
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default function LyricsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <p className="text-text-muted font-mono">loading...</p>
        </div>
      }
    >
      <LyricsContent />
    </Suspense>
  );
}
