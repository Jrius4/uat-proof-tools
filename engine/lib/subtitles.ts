export type Cue = { startMs: number; endMs: number; text: string };

export const MAX_LINE_CHARS = 42;
const MAX_CUE_CHARS = MAX_LINE_CHARS * 2;
const MIN_CUE_MS = 1200;

/** Split narration into chunks that fit two subtitle lines. */
export function chunkText(text: string): string[] {
  const sentences = text.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
  const out: string[] = [];
  for (const s of sentences) {
    let rest = s;
    while (rest.length > MAX_CUE_CHARS) {
      // Prefer a comma/semicolon, then a space, nearest the middle-ish but within the limit.
      const window = rest.slice(0, MAX_CUE_CHARS);
      let cut = Math.max(window.lastIndexOf(', '), window.lastIndexOf('; '));
      if (cut < MAX_LINE_CHARS / 2) cut = window.lastIndexOf(' ');
      if (cut <= 0) cut = MAX_CUE_CHARS;
      out.push(rest.slice(0, cut + 1).trim());
      rest = rest.slice(cut + 1).trim();
    }
    if (rest) out.push(rest);
  }
  return out;
}

/** Wrap one chunk to at most two balanced lines. */
export function wrapLines(chunk: string): string {
  if (chunk.length <= MAX_LINE_CHARS) return chunk;
  const mid = Math.floor(chunk.length / 2);
  let best = -1;
  for (let i = 0; i < chunk.length; i++) {
    if (chunk[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  }
  return best < 0 ? chunk : `${chunk.slice(0, best)}\n${chunk.slice(best + 1)}`;
}

/** Spread narration across [startMs, startMs + durMs] in proportion to text length. */
export function cuesFor(text: string, startMs: number, durMs: number): Cue[] {
  // Join neighbouring sentences while they still fit two lines, so short phrases don't flicker.
  let chunks: string[] = [];
  for (const c of chunkText(text)) {
    const prev = chunks[chunks.length - 1];
    if (prev !== undefined && prev.length + 1 + c.length <= MAX_CUE_CHARS) chunks[chunks.length - 1] = `${prev} ${c}`;
    else chunks.push(c);
  }
  // Never let cues be shorter than a viewer can read: merge tiny ones.
  while (chunks.length > 1 && durMs / chunks.length < MIN_CUE_MS) {
    chunks = [`${chunks[0]} ${chunks[1]}`, ...chunks.slice(2)];
  }
  const total = chunks.reduce((n, c) => n + c.length, 0) || 1;
  let t = startMs;
  return chunks.map((c, i) => {
    const d = i === chunks.length - 1 ? startMs + durMs - t : Math.round((durMs * c.length) / total);
    const cue = { startMs: t, endMs: t + d, text: wrapLines(c) };
    t += d;
    return cue;
  });
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
function stamp(ms: number, sep: ',' | '.') {
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms % 1000, 3)}`;
}

export const toSrt = (cues: Cue[]) => cues.map((c, i) => `${i + 1}\n${stamp(c.startMs, ',')} --> ${stamp(c.endMs, ',')}\n${c.text}\n`).join('\n');
export const toVtt = (cues: Cue[]) => 'WEBVTT\n\n' + cues.map((c) => `${stamp(c.startMs, '.')} --> ${stamp(c.endMs, '.')}\n${c.text}\n`).join('\n');
