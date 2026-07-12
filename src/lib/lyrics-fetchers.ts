import type { LyricLine, LyricResult } from "./use-lyrics";
import { getCachedLyrics, setCachedLyrics } from "./lyrics-cache";

const MUSIXMATCH_TOKENS = (process.env.MUSIXMATCH_TOKENS || "")
  .split(",")
  .map((t) => t.trim())
  .filter(Boolean);

const BASE_HOSTS = (process.env.LYRICSPLUS_HOSTS || "")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

const tokenCooldown = new Map<string, number>();

function getUsableToken(): string | null {
  const now = Date.now();
  for (const [tok, until] of tokenCooldown) {
    if (now >= until) tokenCooldown.delete(tok);
  }
  const available = MUSIXMATCH_TOKENS.filter((t) => !tokenCooldown.has(t));
  if (available.length === 0) {
    console.warn(
      "[MXM] No usable tokens available. Total tokens:",
      MUSIXMATCH_TOKENS.length,
    );
    return null;
  }
  return available[Math.floor(Math.random() * available.length)];
}

function markTokenExhausted(token: string, retryAfterSeconds = 60) {
  tokenCooldown.set(token, Date.now() + retryAfterSeconds * 1000);
}

function parseLyricsPlus(data: any): LyricResult | null {
  if (!data?.lyrics || !Array.isArray(data.lyrics)) return null;
  const lyrics: LyricLine[] = data.lyrics.map((line: any) => ({
    time: line.time,
    text: line.text,
    syllabus: line.syllabus || undefined,
  }));
  const writers = data.metadata?.songWriters?.join(", ") || "";
  const type = lyrics.some((l) => l.syllabus?.length) ? "word" : "line";
  return { lyrics, writers, type, source: "" };
}

function parseLRCLIB(data: any): LyricResult | null {
  if (data?.syncedLyrics) {
    const lines = data.syncedLyrics.split("\n");
    const lyrics: LyricLine[] = [];
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2})\]/;
    for (const line of lines) {
      const match = line.match(timeRegex);
      if (match) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const centiseconds = parseInt(match[3], 10);
        const time = minutes * 60000 + seconds * 1000 + centiseconds * 10;
        const text = line.replace(timeRegex, "").trim();
        if (text) lyrics.push({ time, text });
      }
    }
    return { lyrics, writers: "", type: "line", source: "lrclib" };
  }
  if (data?.plainLyrics) {
    const lyrics: LyricLine[] = data.plainLyrics
      .split("\n")
      .filter(Boolean)
      .map((t: string) => ({ time: 0, text: t }));
    return { lyrics, writers: "", type: "static", source: "lrclib" };
  }
  return null;
}

function parseRichSync(richSyncBody: any[]): LyricResult {
  const lyrics: LyricLine[] = [];
  for (const line of richSyncBody) {
    const ts = line.ts;
    const chars: { c: string; o: number; d: number }[] = line.l || [];
    if (chars.length === 0) continue;
    const syllabus: { time: number; duration: number; text: string }[] = [];
    let currentWordChars: string[] = [];
    let wordStartOffset: number | null = null;
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (ch.c === " ") {
        if (currentWordChars.length > 0 && wordStartOffset !== null) {
          const wordText = currentWordChars.join("");
          const wordTime = ts + wordStartOffset;
          syllabus.push({
            time: Math.round(wordTime * 1000),
            duration: 0,
            text: wordText,
          });
        }
        currentWordChars = [];
        wordStartOffset = null;
      } else {
        if (currentWordChars.length === 0) {
          wordStartOffset = ch.o;
        }
        currentWordChars.push(ch.c);
      }
    }
    if (currentWordChars.length > 0 && wordStartOffset !== null) {
      const wordText = currentWordChars.join("");
      const wordTime = ts + wordStartOffset;
      syllabus.push({
        time: Math.round(wordTime * 1000),
        duration: 0,
        text: wordText,
      });
    }
    const fullText = chars.map((c) => c.c).join("");
    if (syllabus.length > 0) {
      lyrics.push({
        time: Math.round(ts * 1000),
        text: fullText,
        syllabus,
      });
    } else {
      lyrics.push({
        time: Math.round(ts * 1000),
        text: fullText,
      });
    }
  }
  return { lyrics, writers: "", type: "word", source: "musixmatch" };
}

function logMusixmatch(label: string, data: any) {
  if (process.env.NODE_ENV === "development") {
    console.log(`[MXM ${label}]`, JSON.stringify(data, null, 2));
  }
}

export async function fetchMusixmatch(
  artist: string,
  title: string,
  typePreference: string,
  album?: string,
): Promise<LyricResult | null> {
  const cached = getCachedLyrics(artist, title);
  if (cached && cached.source === "musixmatch") return cached;

  const getTrackIdAndAlbumArt = async (): Promise<{
    trackId: number | null;
    albumCover: string;
    tokenUsed: string;
  }> => {
    const usableToken = getUsableToken();
    if (!usableToken) {
      console.warn("[MXM] No usable token for track ID fetch");
      return { trackId: null, albumCover: "", tokenUsed: "" };
    }
    try {
      const params = new URLSearchParams({
        format: "json",
        q_artist: artist,
        q_track: title,
        subtitle_format: "mxm",
        usertoken: usableToken,
        app_id: "web-desktop-app-v1.0",
      });
      const url = `https://apic-appmobile.musixmatch.com/ws/1.1/macro.subtitles.get?${params.toString()}`;
      const res = await fetch(url);
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("retry-after") || "60");
        markTokenExhausted(usableToken, retryAfter);
        return getTrackIdAndAlbumArt();
      }
      if (!res.ok) {
        console.warn(`[MXM] macro.subtitles error ${res.status}`);
        return { trackId: null, albumCover: "", tokenUsed: usableToken };
      }
      const data = await res.json();
      logMusixmatch("macro.subtitles (id/cover)", data);
      const macroCalls = data?.message?.body?.macro_calls;
      const track =
        macroCalls?.["matcher.track.get"]?.message?.body?.track ||
        macroCalls?.["track.get"]?.message?.body?.track;
      let trackId: number | null = null;
      let albumCover = "";
      if (track) {
        trackId = Number(track.commontrack_id || track.track_id) || null;
        albumCover =
          track.album_coverart_500x500 ||
          track.album_coverart_350x350 ||
          track.album_coverart_100x100 ||
          "";
      }
      return { trackId, albumCover, tokenUsed: usableToken };
    } catch (e) {
      console.error("[MXM] macro.subtitles fetch error", e);
      return { trackId: null, albumCover: "", tokenUsed: usableToken };
    }
  };

  if (typePreference === "word") {
    const { trackId, albumCover, tokenUsed } = await getTrackIdAndAlbumArt();
    if (trackId && tokenUsed) {
      try {
        const params = new URLSearchParams({
          format: "json",
          commontrack_id: String(trackId),
          usertoken: tokenUsed,
          app_id: "web-desktop-app-v1.0",
        });
        const url = `https://apic-appmobile.musixmatch.com/ws/1.1/track.richsync.get?${params.toString()}`;
        const res = await fetch(url);
        if (res.status === 429) {
          markTokenExhausted(tokenUsed);
        } else if (res.ok) {
          const data = await res.json();
          logMusixmatch("richsync", data);
          const body = data?.message?.body?.richsync?.richsync_body;
          if (body && typeof body === "string") {
            const parsed = JSON.parse(body);
            const result = parseRichSync(parsed);
            if (result.lyrics.length > 0) {
              const final = { ...result, source: "musixmatch", albumCover };
              setCachedLyrics(artist, title, final);
              return final;
            }
          }
        } else {
          console.warn(`[MXM] richsync error ${res.status}`);
        }
      } catch (e) {
        console.error("[MXM] richsync fetch error", e);
      }
    }
  }

  const usableToken = getUsableToken();
  if (!usableToken) {
    console.warn("[MXM] No usable token for lyrics fetch");
    return null;
  }

  try {
    const params = new URLSearchParams({
      format: "json",
      q_artist: artist,
      q_track: title,
      subtitle_format: "mxm",
      usertoken: usableToken,
      app_id: "web-desktop-app-v1.0",
    });
    const url = `https://apic-appmobile.musixmatch.com/ws/1.1/macro.subtitles.get?${params.toString()}`;
    console.log(`[MXM] Fetching: ${url.replace(usableToken, "***")}`);
    const res = await fetch(url);
    if (res.status === 429) {
      markTokenExhausted(usableToken);
      return fetchMusixmatch(artist, title, typePreference, album);
    }
    if (!res.ok) {
      console.warn(`[MXM] macro.subtitles error ${res.status}`);
      return null;
    }

    const data = await res.json();
    logMusixmatch("macro.subtitles", data);
    const macroCalls = data?.message?.body?.macro_calls;

    let albumCover = "";
    const track =
      macroCalls?.["matcher.track.get"]?.message?.body?.track ||
      macroCalls?.["track.get"]?.message?.body?.track;
    if (track) {
      albumCover =
        track.album_coverart_500x500 ||
        track.album_coverart_350x350 ||
        track.album_coverart_100x100 ||
        "";
    }

    const subtitle =
      macroCalls?.["track.subtitles.get"]?.message?.body?.subtitle_list?.[0]
        ?.subtitle;
    if (subtitle?.subtitle_body) {
      const lines = JSON.parse(subtitle.subtitle_body);
      const lyrics: LyricLine[] = lines
        .filter((s: any) => s.text.trim() !== "")
        .map((s: any) => ({
          time: Math.max(0, Math.round(s.time.total * 1000) - 500),
          text: s.text,
        }));
      if (lyrics.length === 0) return null;
      let writers = "";
      if (subtitle.lyrics_copyright) {
        const parts = subtitle.lyrics_copyright.split("Copyright:");
        writers = parts[0].replace(/Writer\(s\):\s*/, "").trim();
      }
      const result: LyricResult = {
        lyrics,
        writers,
        type: "line",
        source: "musixmatch",
        albumCover,
      };
      setCachedLyrics(artist, title, result);
      return result;
    }

    const lyricsGet = macroCalls?.["track.lyrics.get"];
    if (lyricsGet?.message?.header?.status_code === 200) {
      const body = lyricsGet.message.body?.lyrics?.lyrics_body;
      if (body) {
        const lyrics: LyricLine[] = body
          .split("\n")
          .filter(Boolean)
          .map((t: string) => ({ time: 0, text: t }));
        if (lyrics.length === 0) return null;
        let writers = "";
        const copyright = lyricsGet.message.body?.lyrics?.lyrics_copyright;
        if (copyright) {
          const parts = copyright.split("Copyright:");
          writers = parts[0].replace(/Writer\(s\):\s*/, "").trim();
        }
        const result: LyricResult = {
          lyrics,
          writers,
          type: "static",
          source: "musixmatch",
          albumCover,
        };
        setCachedLyrics(artist, title, result);
        return result;
      }
    }
  } catch (e) {
    console.error("[MXM] macro.subtitles fetch error", e);
  }

  return null;
}

export async function fetchLyricsPlus(
  artist: string,
  title: string,
  album: string,
): Promise<LyricResult | null> {
  const cached = getCachedLyrics(artist, title);
  if (cached && cached.source === "lyricsplus") return cached;

  const params = new URLSearchParams({ artist, title, album });
  const fetches = BASE_HOSTS.map(async (host) => {
    try {
      const url = `${host}/v2/lyrics/get?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const json = await res.json();
      return parseLyricsPlus(json);
    } catch {
      return null;
    }
  });
  const results = await Promise.allSettled(fetches);
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) {
      const val = r.value;
      val.source = "lyricsplus";
      setCachedLyrics(artist, title, val);
      return val;
    }
  }
  return null;
}

export async function fetchLRCLIB(
  artist: string,
  title: string,
  album: string,
): Promise<LyricResult | null> {
  const cached = getCachedLyrics(artist, title);
  if (cached && cached.source === "lrclib") return cached;

  try {
    const params = new URLSearchParams({
      artist_name: artist,
      track_name: title,
      album_name: album,
    });
    const url = `https://lrclib.net/api/get?${params.toString()}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "lyrics-app/1.0" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const parsed = parseLRCLIB(data);
    if (parsed) {
      parsed.source = "lrclib";
      setCachedLyrics(artist, title, parsed);
    }
    return parsed;
  } catch {
    return null;
  }
}

export const rateLimitMap = new Map<string, number>();

export function checkRateLimit(
  artist: string,
  title: string,
  album: string,
): boolean {
  const key = `${artist}|||${title}|||${album}`;
  const now = Date.now();
  const last = rateLimitMap.get(key);
  if (last && now - last < 60_000) return false;
  rateLimitMap.set(key, now);
  return true;
}
