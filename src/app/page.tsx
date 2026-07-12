"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [artist, setArtist] = useState("");
  const [title, setTitle] = useState("");
  const [album, setAlbum] = useState("");

  const [sources, setSources] = useState<string[]>([
    "musixmatch",
    "lyricsplus",
    "lrclib",
  ]);
  const [type, setType] = useState<"line" | "sync" | "word">("sync");

  const router = useRouter();

  const toggleSource = (s: string) => {
    setSources((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (artist.trim() && title.trim()) {
      const params = new URLSearchParams();
      params.set("artist", artist.trim());
      params.set("title", title.trim());
      if (album.trim()) params.set("album", album.trim());
      params.set("sources", sources.join(","));
      params.set("type", type);
      router.push(`/lyrics?${params.toString()}`);
      return;
    }

    if (artist.trim() && album.trim() && !title.trim()) {
      router.push(
        `/album?artist=${encodeURIComponent(artist.trim())}&album=${encodeURIComponent(album.trim())}`,
      );
      return;
    }
  };

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <h1 className="text-2xl font-light text-text mb-8 text-center">
          lyrics search
        </h1>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-text-faint font-mono uppercase tracking-widest">
              artist
            </label>
            <input
              type="text"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              required
              className="bg-card border border-border text-text px-4 py-3 text-sm font-mono focus:outline-none focus:border-text-muted transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-text-faint font-mono uppercase tracking-widest">
              title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-card border border-border text-text px-4 py-3 text-sm font-mono focus:outline-none focus:border-text-muted transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-text-faint font-mono uppercase tracking-widest">
              album
            </label>
            <input
              type="text"
              value={album}
              onChange={(e) => setAlbum(e.target.value)}
              className="bg-card border border-border text-text px-4 py-3 text-sm font-mono focus:outline-none focus:border-text-muted transition-colors"
            />
          </div>

          <div className="space-y-2">
            <p className="text-[10px] text-text-faint font-mono uppercase tracking-widest">
              sources
            </p>
            <div className="flex gap-4">
              {["musixmatch", "lyricsplus", "lrclib"].map((s) => (
                <label
                  key={s}
                  className="flex items-center gap-2 text-xs font-mono text-text-muted"
                >
                  <input
                    type="checkbox"
                    checked={sources.includes(s)}
                    onChange={() => toggleSource(s)}
                    className="accent-text"
                  />
                  {s}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] text-text-faint font-mono uppercase tracking-widest">
              type
            </p>
            <div className="flex gap-4">
              {[
                ["line", "Line (no timestamps)"],
                ["sync", "Synced (line timed)"],
                ["word", "Word‑by‑word"],
              ].map(([val, label]) => (
                <label
                  key={val}
                  className="flex items-center gap-2 text-xs font-mono text-text-muted"
                >
                  <input
                    type="radio"
                    name="type"
                    value={val}
                    checked={type === val}
                    onChange={() => setType(val as any)}
                    className="accent-text"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-card hover:bg-card-hover border border-border text-text font-mono py-3 text-sm tracking-widest uppercase transition-colors duration-500"
          >
            search
          </button>
        </form>
      </div>
    </main>
  );
}
