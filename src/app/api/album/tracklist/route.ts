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

interface Candidate {
  id: string;
  artist: string;
  title: string;
  cover?: string;
  tracks: number;
}

function curlGet(url: string): Promise<string> {
  return execFileAsync("curl", ["-s", "--max-time", "10", url], {
    timeout: 11000,
  }).then(({ stdout }) => stdout);
}

async function fetchDeezerCandidates(
  artist: string,
  album: string,
): Promise<Candidate[]> {
  const query = `artist:"${artist}" album:"${album}"`;
  const url = `https://api.deezer.com/search/album?q=${encodeURIComponent(query)}&limit=15`;

  let jsonStr: string;
  try {
    jsonStr = await curlGet(url);
  } catch {
    return [];
  }

  let data: any;
  try {
    data = JSON.parse(jsonStr);
  } catch {
    return [];
  }

  const items = data?.data || [];
  const candidates: Candidate[] = [];

  for (const a of items) {
    candidates.push({
      id: `deezer:${a.id}`,
      artist: a.artist?.name || "Unknown Artist",
      title: a.title,
      cover:
        a.cover_xl ||
        a.cover_big ||
        a.cover_medium ||
        a.cover_small ||
        undefined,
      tracks: a.nb_tracks || 0,
    });
  }
  return candidates;
}

async function fetchDeezerTracks(
  albumId: string,
  artist: string,
  album: string,
): Promise<Track[]> {
  const url = `https://api.deezer.com/album/${albumId}/tracks?limit=100`;

  let jsonStr: string;
  try {
    jsonStr = await curlGet(url);
  } catch {
    return [];
  }

  let data: any;
  try {
    data = JSON.parse(jsonStr);
  } catch {
    return [];
  }

  const items = data?.data || [];
  const tracks: Track[] = [];
  let cover = "";

  // Album cover can be fetched from a track's album object
  if (items.length > 0 && items[0].album) {
    cover =
      items[0].album.cover_xl ||
      items[0].album.cover_big ||
      items[0].album.cover_medium ||
      "";
  }

  for (const t of items) {
    tracks.push({
      title: t.title,
      artist: t.artist?.name || artist,
      track: t.track_position,
      duration: t.duration ? t.duration * 1000 : undefined,
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
  const deezerId = searchParams.get("deezer_id");

  if (!artist || !album) {
    return NextResponse.json(
      { error: "artist and album required" },
      { status: 400 },
    );
  }

  if (deezerId) {
    try {
      const tracks = await fetchDeezerTracks(deezerId, artist, album);
      return NextResponse.json({ tracks });
    } catch {
      return NextResponse.json(
        { error: "failed to fetch tracks" },
        { status: 500 },
      );
    }
  }

  const candidates = await fetchDeezerCandidates(artist, album);

  if (candidates.length === 0) {
    return NextResponse.json({ candidates: [] });
  }

  if (candidates.length === 1) {
    const c = candidates[0];
    const tracks = await fetchDeezerTracks(c.id.slice(7), artist, album);
    return NextResponse.json({ tracks });
  }

  return NextResponse.json({ candidates });
}
