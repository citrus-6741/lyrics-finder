import type { LyricLine } from "./use-lyrics";

interface Meta {
  artist: string;
  title: string;
  album?: string;
  writers?: string;
}

export function generateLRC(lyrics: LyricLine[], meta: Meta): string {
  let lrc = `[ar:${meta.artist}]\n[ti:${meta.title}]\n`;
  if (meta.album) lrc += `[al:${meta.album}]\n`;
  // lrc += `[by:hahahahahahhahahhahahahahah]\n\n`;
  lyrics.forEach((l) => {
    const ts = formatTimeLRC(l.time);
    lrc += `[${ts}]${l.text}\n`;
  });
  return lrc;
}

export function generateJSON(lyrics: LyricLine[], meta: Meta): string {
  return JSON.stringify({ meta, lyrics }, null, 2);
}

export function generateTXT(lyrics: LyricLine[]): string {
  return lyrics.map((l) => l.text).join("\n");
}

function formatTimeLRC(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function formatTimeTTML(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const msRem = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(msRem).padStart(3, "0")}`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function generateTTML(lyrics: LyricLine[], meta: Meta): string {
  let ttml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  ttml += `<tt xmlns="http://www.w3.org/ns/ttml" xml:lang="en">\n`;
  ttml += `  <head>\n`;
  ttml += `    <metadata>\n`;
  ttml += `      <title>${meta.title} - ${meta.artist}</title>\n`;
  ttml += `    </metadata>\n`;
  ttml += `  </head>\n`;
  ttml += `  <body>\n`;
  ttml += `    <div>\n`;

  for (let i = 0; i < lyrics.length; i++) {
    const line = lyrics[i];
    const begin = formatTimeTTML(line.time);
    const end =
      i < lyrics.length - 1
        ? formatTimeTTML(lyrics[i + 1].time - 10)
        : formatTimeTTML(line.time + 5000);
    ttml += `      <p begin="${begin}" end="${end}" xml:id="l${i}">`;

    if (line.syllabus && line.syllabus.length > 0) {
      for (const word of line.syllabus) {
        const wordBegin = formatTimeTTML(word.time);
        const wordEnd = formatTimeTTML(word.time + (word.duration || 200));
        ttml += `<span begin="${wordBegin}" end="${wordEnd}">${escapeXml(word.text)}</span> `;
      }
    } else {
      ttml += escapeXml(line.text);
    }
    ttml += `</p>\n`;
  }

  ttml += `    </div>\n`;
  ttml += `  </body>\n`;
  ttml += `</tt>`;
  return ttml;
}
