import type { LyricLine } from "@/lib/use-lyrics";

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function LyricsViewer({ lyrics }: { lyrics: LyricLine[] }) {
  return (
    <div className="space-y-2 font-mono text-sm leading-relaxed">
      {lyrics.map((line, i) => {
        const words = line.text.split(" ");
        const syllabus = line.syllabus || [];
        const hasSyllabus = syllabus.length > 0;

        return (
          <div key={i} className="flex gap-4">
            <span className="text-text-faint w-12 text-right flex-shrink-0 tabular-nums">
              {line.time ? formatTime(line.time) : "--:--"}
            </span>
            <span className="text-text">
              {hasSyllabus
                ? words.map((word, idx) => {
                    const isTimed = idx < syllabus.length;
                    return (
                      <span
                        key={idx}
                        className={isTimed ? "text-text" : "text-text-faint"}
                      >
                        {word}
                        {idx < words.length - 1 ? " " : ""}
                      </span>
                    );
                  })
                : line.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}
