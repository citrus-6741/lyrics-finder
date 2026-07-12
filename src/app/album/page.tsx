"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  generateLRC,
  generateJSON,
  generateTXT,
  generateTTML,
} from "@/lib/download-utils";
import type { LyricResult } from "@/lib/use-lyrics";

interface Track {
  title: string;
  artist: string;
  track: number;
  duration?: number;
  album: string;
  cover?: string;
  isrc?: string;
}

interface LyricData extends LyricResult {
  fetched: boolean;
}

function TrackRow({
  track,
  lyricData,
  onRetry,
  onDownload,
  onFetch,
}: {
  track: Track;
  lyricData: LyricData | undefined;
  onRetry: (track: Track, source: string) => void;
  onDownload: (track: Track, format: string) => void;
  onFetch: (track: Track) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [retrySource, setRetrySource] = useState("musixmatch");
  const [isFetching, setIsFetching] = useState(false);
  const hasLyrics = lyricData?.fetched && lyricData.lyrics.length > 0;
  const isFetched = lyricData?.fetched;

  const handleFetch = async () => {
    setIsFetching(true);
    await onFetch(track);
    setIsFetching(false);
  };

  return (
    <div className="border border-border bg-card group">
      <div className="flex items-center gap-4 px-4 py-3">
        <span className="text-text-faint font-mono text-xs w-6 text-right tabular-nums">
          {String(track.track).padStart(2, "0")}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text truncate">{track.title}</p>
          {track.duration && (
            <p className="text-[10px] text-text-faint font-mono">
              {Math.floor(track.duration / 60000)}:
              {String(Math.floor((track.duration % 60000) / 1000)).padStart(
                2,
                "0",
              )}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isFetched ? (
            <button
              onClick={handleFetch}
              disabled={isFetching}
              className={`text-[10px] font-mono uppercase ${
                isFetching
                  ? "text-text-faint cursor-wait"
                  : "text-text-faint hover:text-text-muted"
              }`}
            >
              {isFetching ? "fetching..." : "fetch"}
            </button>
          ) : hasLyrics ? (
            <>
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-[10px] text-text-faint hover:text-text-muted font-mono uppercase transition-colors"
              >
                {expanded ? "hide" : "view"}
              </button>
              <div className="flex gap-1">
                {["lrc", "json", "txt", "ttml"].map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => onDownload(track, fmt)}
                    className="text-[10px] text-text-faint hover:text-text-muted font-mono uppercase px-1"
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <select
                value={retrySource}
                onChange={(e) => setRetrySource(e.target.value)}
                className="bg-card border border-border text-text-muted px-1 py-0.5 text-[10px] font-mono uppercase"
              >
                {["musixmatch", "lyricsplus", "lrclib"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button
                onClick={() => onRetry(track, retrySource)}
                className="text-[10px] text-text-faint hover:text-text-muted font-mono uppercase"
              >
                retry
              </button>
            </div>
          )}
        </div>
      </div>

      {expanded && hasLyrics && lyricData && (
        <div className="px-4 pb-4 border-t border-border">
          <div className="text-text-faint text-[10px] font-mono mt-2 mb-3 uppercase">
            source: {lyricData.source} · type: {lyricData.type}
            {lyricData.writers && ` · writers: ${lyricData.writers}`}
          </div>
          <div className="space-y-1 font-mono text-sm leading-relaxed">
            {lyricData.lyrics.map((line, i) => (
              <div key={i} className="flex gap-4">
                <span className="text-text-faint w-12 text-right flex-shrink-0 tabular-nums">
                  {line.time
                    ? `${String(Math.floor(line.time / 60000)).padStart(2, "0")}:${String(Math.floor((line.time % 60000) / 1000)).padStart(2, "0")}`
                    : "--:--"}
                </span>
                <span className="text-text">{line.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AlbumPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const artist = searchParams.get("artist") || "";
  const album = searchParams.get("album") || "";

  const [tracks, setTracks] = useState<Track[]>([]);
  const [lyricsMap, setLyricsMap] = useState<Map<number, LyricData>>(new Map());
  const [fetching, setFetching] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [globalSources, setGlobalSources] = useState<string[]>([
    "musixmatch",
    "lyricsplus",
    "lrclib",
  ]);
  const [globalType, setGlobalType] = useState<"line" | "sync" | "word">(
    "sync",
  );
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadFormats, setDownloadFormats] = useState<string[]>([
    "lrc",
    "txt",
  ]);
  const [albumCover, setAlbumCover] = useState("");
  const [loadingTracklist, setLoadingTracklist] = useState(true);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const sourcesRef = useRef<HTMLDivElement>(null);

  const toggleSource = (s: string) => {
    setGlobalSources((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  };

  const toggleDownloadFormat = (f: string) => {
    setDownloadFormats((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f],
    );
  };

  useEffect(() => {
    if (!artist || !album) return;
    setLoadingTracklist(true);
    fetch(
      `/api/album/tracklist?artist=${encodeURIComponent(artist)}&album=${encodeURIComponent(album)}`,
    )
      .then((r) => r.json())
      .then((data: Track[]) => {
        setTracks(data);
        const cover = data.find((t) => t.cover)?.cover;
        if (cover) setAlbumCover(cover);
      })
      .catch(() => setTracks([]))
      .finally(() => setLoadingTracklist(false));
  }, [artist, album]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        sourcesRef.current &&
        !sourcesRef.current.contains(e.target as Node)
      ) {
        setSourcesOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchAllLyrics = async () => {
    setFetching(true);
    setProgress({ current: 0, total: tracks.length });
    const response = await fetch("/api/album/lyrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tracks,
        sources: globalSources,
        type: globalType,
      }),
    });
    const reader = response.body?.getReader();
    if (!reader) {
      setFetching(false);
      return;
    }
    const decoder = new TextDecoder();
    let buffer = "";
    const newMap = new Map(lyricsMap);
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.progress) {
            setProgress(data.progress);
          } else if (data.done) {
            const results: (LyricResult | null)[] = data.results;
            results.forEach((res, idx) => {
              if (res) newMap.set(idx, { ...res, fetched: true });
            });
            setLyricsMap(new Map(newMap));
          }
        } catch {}
      }
    }
    setFetching(false);
  };

  const fetchSingleTrack = async (track: Track) => {
    const idx = tracks.indexOf(track);
    if (idx === -1) return;
    const params = new URLSearchParams({
      artist: track.artist,
      title: track.title,
      album: track.album,
      type: globalType,
    });
    if (globalSources.length > 0)
      params.set("sources", globalSources.join(","));
    const res = await fetch(`/api/search?${params.toString()}`);
    if (!res.ok) return;
    const data: LyricResult = await res.json();
    setLyricsMap((prev) => new Map(prev).set(idx, { ...data, fetched: true }));
  };

  const retryTrack = async (track: Track, source: string) => {
    const res = await fetch(
      `/api/search?artist=${encodeURIComponent(track.artist)}&title=${encodeURIComponent(track.title)}&source=${source}&type=line`,
    );
    if (res.ok) {
      const data: LyricResult = await res.json();
      const idx = tracks.indexOf(track);
      if (idx !== -1)
        setLyricsMap((prev) =>
          new Map(prev).set(idx, { ...data, fetched: true }),
        );
    }
  };

  const downloadTrack = (track: Track, format: string) => {
    const idx = tracks.indexOf(track);
    const lyrics = idx !== -1 ? lyricsMap.get(idx) : undefined;
    if (!lyrics) return;
    const meta = {
      artist: track.artist,
      title: track.title,
      album: track.album,
    };
    let content = "",
      ext = "",
      mime = "text/plain";
    switch (format) {
      case "lrc":
        content = generateLRC(lyrics.lyrics, meta);
        ext = "lrc";
        break;
      case "json":
        content = generateJSON(lyrics.lyrics, meta);
        ext = "json";
        mime = "application/json";
        break;
      case "txt":
        content = generateTXT(lyrics.lyrics);
        ext = "txt";
        break;
      case "ttml":
        content = generateTTML(lyrics.lyrics, meta);
        ext = "ttml";
        mime = "application/xml+ttml";
        break;
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${String(track.track).padStart(2, "0")} - ${track.title}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAlbum = async () => {
    const fetchedTracks = tracks.filter((_, i) => {
      const d = lyricsMap.get(i);
      return d?.fetched && d.lyrics.length > 0;
    });
    if (fetchedTracks.length === 1) {
      for (const fmt of downloadFormats) downloadTrack(fetchedTracks[0], fmt);
      setShowDownloadModal(false);
      return;
    }
    const dataTracks = tracks.map((t, i) => ({
      title: t.title,
      artist: t.artist,
      track: t.track,
      lyrics: lyricsMap.get(i) || null,
    }));
    const res = await fetch("/api/album/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        album: { artist, title: album },
        tracks: dataTracks,
        formats: downloadFormats,
      }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${artist} - ${album}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    setShowDownloadModal(false);
  };

  if (!artist || !album) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-text-muted font-mono text-sm">
          missing artist/album
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <button
          onClick={() => router.back()}
          className="text-xs text-text-faint hover:text-text-muted font-mono mb-8 transition-colors"
        >
          ← back
        </button>

        <div className="mb-12 flex flex-col items-center">
          {albumCover && (
            <img
              src={albumCover}
              alt=""
              className="w-28 h-28 object-cover mb-3"
            />
          )}
          <h1 className="text-2xl font-light text-text mb-1 text-center">
            {album}
          </h1>
          <p className="text-sm text-text-muted font-mono capitalize">
            {artist}
          </p>
        </div>

        {loadingTracklist ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-sm text-text-muted font-mono animate-pulse">
              fetching tracks...
            </p>
          </div>
        ) : (
          <>
            <div className="mb-10">
              <div className="flex justify-between items-end mb-4">
                <div className="space-y-1 relative" ref={sourcesRef}>
                  <span className="block text-text-faint uppercase tracking-widest text-xs font-mono">
                    sources
                  </span>
                  <button
                    onClick={() => setSourcesOpen(!sourcesOpen)}
                    className="bg-card border border-border text-text-muted px-3 py-1.5 text-xs font-mono uppercase flex items-center gap-2 hover:bg-card-hover transition-colors"
                  >
                    {globalSources.length === 0
                      ? "none"
                      : globalSources.length === 3
                        ? "all"
                        : `${globalSources.length} selected`}
                    <svg
                      className={`w-3 h-3 transition-transform ${sourcesOpen ? "rotate-180" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                  {sourcesOpen && (
                    <div className="absolute top-full left-0 mt-1 bg-card border border-border shadow-lg z-50 min-w-[160px]">
                      {["musixmatch", "lyricsplus", "lrclib"].map((s) => (
                        <label
                          key={s}
                          className="flex items-center gap-2 px-3 py-2 text-xs font-mono text-text-muted hover:bg-card-hover cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={globalSources.includes(s)}
                            onChange={() => toggleSource(s)}
                            className="accent-text"
                          />
                          {s}
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="block text-text-faint uppercase tracking-widest text-xs font-mono">
                    type
                  </span>
                  <select
                    value={globalType}
                    onChange={(e) => setGlobalType(e.target.value as any)}
                    className="bg-card border border-border text-text-muted px-2 py-1 text-xs font-mono focus:outline-none focus:border-text-muted transition-colors uppercase"
                  >
                    <option value="line">Line</option>
                    <option value="sync">Synced</option>
                    <option value="word">Word</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <button
                  onClick={fetchAllLyrics}
                  disabled={fetching || tracks.length === 0}
                  className={`px-4 py-2 border border-border font-mono text-xs uppercase transition-colors duration-500 ${
                    fetching
                      ? "bg-card text-text-faint cursor-wait"
                      : "bg-card hover:bg-card-hover text-text-muted hover:text-text"
                  }`}
                >
                  {fetching ? "fetching..." : "fetch all lyrics"}
                </button>

                {lyricsMap.size > 0 && (
                  <button
                    onClick={() => setShowDownloadModal(true)}
                    className="px-4 py-2 border border-border bg-card hover:bg-card-hover text-text-muted hover:text-text font-mono text-xs uppercase transition-colors duration-500"
                  >
                    download album
                  </button>
                )}
              </div>
            </div>

            {fetching && (
              <div className="mb-8">
                <div className="flex justify-between text-[10px] text-text-faint font-mono mb-1">
                  <span>fetching lyrics</span>
                  <span>
                    {progress.current} / {progress.total}
                  </span>
                </div>
                <div className="h-1 bg-border overflow-hidden">
                  <div
                    className="h-full bg-text-muted transition-all duration-300"
                    style={{
                      width: `${(progress.current / Math.max(progress.total, 1)) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              {tracks.map((track, idx) => (
                <TrackRow
                  key={idx}
                  track={track}
                  lyricData={lyricsMap.get(idx)}
                  onRetry={retryTrack}
                  onDownload={downloadTrack}
                  onFetch={fetchSingleTrack}
                />
              ))}
            </div>

            {tracks.length === 0 && !fetching && (
              <div className="py-20 text-center">
                <p className="text-text-muted font-mono">no tracks found</p>
              </div>
            )}
          </>
        )}
      </div>

      {showDownloadModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-background border border-border p-6 max-w-sm w-full">
            <h2 className="text-sm font-mono text-text mb-4 uppercase tracking-widest">
              download album
            </h2>
            <p className="text-[10px] text-text-faint font-mono mb-3">
              choose formats
            </p>
            <div className="space-y-2 mb-6">
              {["lrc", "json", "txt", "ttml"].map((fmt) => (
                <label
                  key={fmt}
                  className="flex items-center gap-2 text-xs font-mono text-text-muted"
                >
                  <input
                    type="checkbox"
                    checked={downloadFormats.includes(fmt)}
                    onChange={() => toggleDownloadFormat(fmt)}
                    className="accent-text"
                  />
                  {fmt.toUpperCase()}
                </label>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowDownloadModal(false)}
                className="px-4 py-2 border border-border text-text-faint font-mono text-xs hover:bg-card transition-colors"
              >
                cancel
              </button>
              <button
                onClick={downloadAlbum}
                disabled={downloadFormats.length === 0}
                className="px-4 py-2 border border-border bg-card hover:bg-card-hover text-text-muted hover:text-text font-mono text-xs transition-colors disabled:opacity-30"
              >
                download
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function AlbumPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <p className="text-text-muted font-mono">loading...</p>
        </div>
      }
    >
      <AlbumPageContent />
    </Suspense>
  );
}
