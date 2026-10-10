import { appendFileSync, existsSync, readFileSync } from 'node:fs';

export type MarkLine = { id: string; epochMs: number; status?: 'pass' | 'fail'; error?: string };

/** Append one marker. Called by `uatp mark`, so any shell script or tool can timestamp a step. */
export function appendMark(file: string, m: MarkLine) {
  appendFileSync(file, JSON.stringify(m) + '\n');
}

export function readMarks(file: string): MarkLine[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
