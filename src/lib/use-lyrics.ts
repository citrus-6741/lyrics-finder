export type LyricType = "word" | "line" | "static";

export interface LyricLine {
  time: number;
  text: string;
  syllabus?: { time: number; duration: number; text: string }[];
}

export interface LyricResult {
  lyrics: LyricLine[];
  writers: string;
  type: LyricType;
  source: string;
  albumCover?: string;
}
