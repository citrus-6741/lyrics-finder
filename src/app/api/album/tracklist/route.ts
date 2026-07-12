import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

interface Track {
  title: string;
  artist: string;
  track: number;
  duration?: number;
  album: string;
  cover?: string;
  isrc?: string;
}

async function fetchCoverArt(releaseId: string): Promise<string | undefined> {
  try {
    const url = `https://coverartarchive.org/release/${releaseId}/front`;
    const { stdout } = await execFileAsync(
      "curl",
      [
        "-s",
        "-o",
        "/dev/null",
        "-w",
        "%{url_effective}",
        "--max-time",
        "10",
        "-L",
        url,
      ],
      { timeout: 15000 },
    );
    const finalUrl = stdout.trim();
    if (finalUrl && !finalUrl.includes("coverartarchive.org/release/")) {
      return finalUrl;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function fetchMusicBrainz(
  artist: string,
  album: string,
): Promise<Track[]> {
  const cleanAlbum = album
    .replace(/\s*[-–—]\s*EP$/i, "")
    .replace(/\s*\(EP\)$/i, "")
    .replace(/\s*\[EP\]$/i, "")
    .trim();

  const query = `artist:${artist}+AND+release:${cleanAlbum}`;
  const searchUrl = `https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(query)}&fmt=json`;

  try {
    const { stdout } = await execFileAsync(
      "curl",
      ["-s", "--max-time", "15", "-H", "User-Agent: lyrics-app/1.0", searchUrl],
      { timeout: 20000 },
    );

    const searchData = JSON.parse(stdout);
    const release = searchData?.releases?.[0];
    if (!release || !release.id) return [];

    const releaseId = release.id;
    const detailUrl = `https://musicbrainz.org/ws/2/release/${releaseId}?fmt=json&inc=recordings+artist-credits`;

    const { stdout: detailStdout } = await execFileAsync(
      "curl",
      ["-s", "--max-time", "15", "-H", "User-Agent: lyrics-app/1.0", detailUrl],
      { timeout: 20000 },
    );

    const detailData = JSON.parse(detailStdout);
    const media = detailData?.media?.[0];
    if (!media?.tracks) return [];

    const albumArtist = detailData["artist-credit"]?.[0]?.name || artist;
    const coverUrl = await fetchCoverArt(releaseId);

    const tracks: Track[] = [];
    for (const t of media.tracks) {
      const trackArtist = t["artist-credit"]?.[0]?.name || albumArtist;
      tracks.push({
        title: t.title,
        artist: trackArtist,
        track: Number(t.position) || 0,
        duration: t.length ? Math.round(t.length) : undefined,
        album: album,
        cover: undefined,
        isrc: undefined,
      });
    }
    if (coverUrl && tracks.length > 0) {
      tracks[0].cover = coverUrl;
    }
    return tracks;
  } catch (err) {
    console.error("curl MusicBrainz failed:", err);
    return [];
  }
}

async function fetchQobuz(artist: string, album: string): Promise<Track[]> {
  const appId = process.env.QOBUZ_APP_ID;
  if (!appId) return [];
  const searchUrl = `https://www.qobuz.com/api.json/0.2/album/search?app_id=${appId}&query=${encodeURIComponent(album)}&limit=10`;
  const res = await fetch(searchUrl);
  if (!res.ok) return [];
  const data = await res.json();
  const albums = data?.albums?.items || [];
  const matched = albums.find(
    (a: any) => a.artist?.name?.toLowerCase() === artist.toLowerCase(),
  );
  if (!matched) return [];
  const albumId = matched.id;
  const detailUrl = `https://www.qobuz.com/api.json/0.2/album/get?app_id=${appId}&album_id=${albumId}`;
  const detailRes = await fetch(detailUrl);
  if (!detailRes.ok) return [];
  const detail = await detailRes.json();
  const tracks: Track[] = [];
  const cover = detail.image?.large || detail.image?.small || "";
  for (const t of detail.tracks?.items || []) {
    tracks.push({
      title: t.title,
      artist: t.performer?.name || artist,
      track: t.track_number,
      duration: t.duration ? Math.round(t.duration * 1000) : undefined,
      album: album,
      cover: cover || undefined,
      isrc: t.isrc || undefined,
    });
  }
  return tracks;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const artist = searchParams.get("artist") || "";
  const album = searchParams.get("album") || "";
  if (!artist || !album) {
    return NextResponse.json(
      { error: "artist and album required" },
      { status: 400 },
    );
  }

  let tracks: Track[] = [];
  let errorMsg = "";

  try {
    tracks = await fetchMusicBrainz(artist, album);
  } catch (e) {
    errorMsg =
      "MusicBrainz fetch failed: " +
      (e instanceof Error ? e.message : "unknown");
    console.error(errorMsg);
  }

  if (tracks.length === 0) {
    try {
      tracks = await fetchQobuz(artist, album);
    } catch (e) {
      const qobuzError =
        "Qobuz fetch failed: " + (e instanceof Error ? e.message : "unknown");
      console.error(qobuzError);
      errorMsg += (errorMsg ? " | " : "") + qobuzError;
    }
  } else {
    try {
      const qobuzTracks = await fetchQobuz(artist, album);
      if (qobuzTracks.length > 0) {
        const qobuzMap = new Map<number, Track>();
        for (const t of qobuzTracks) qobuzMap.set(t.track, t);
        for (const t of tracks) {
          const q = qobuzMap.get(t.track);
          if (q) {
            t.duration = q.duration || t.duration;
            t.isrc = q.isrc || t.isrc;
            if (!t.cover && q.cover) t.cover = q.cover;
          }
        }
      }
    } catch (e) {
      console.error("Qobuz merge failed:", e);
    }
  }

  if (tracks.length === 0 && errorMsg) {
    return NextResponse.json({ error: errorMsg }, { status: 502 });
  }

  return NextResponse.json(tracks);
}
