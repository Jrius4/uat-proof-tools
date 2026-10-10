import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Scenario } from './scenario.ts';

/** When a step or check began, in ms since the first video frame. */
export type Marker = { id: string; startMs: number };

export type Timeline = {
  scenarioId: string;
  platform: string;
  /** File name of the raw recording, relative to the run directory. */
  video: string;
  markers: Marker[];
};

export type ItemResult = { id: string; passed: boolean; error?: string };

export type Result = {
  scenarioId: string;
  platform: string;
  /** True only if every step and expectation in the scenario ran and passed. */
  passed: boolean;
  items: ItemResult[];
  runner: string;
  startedAt: string;
  notes?: string[];
};

export const timelinePath = (dir: string) => join(dir, 'timeline.json');
export const resultPath = (dir: string) => join(dir, 'result.json');

export function readTimeline(dir: string): Timeline {
  const f = timelinePath(dir);
  if (!existsSync(f)) throw new Error(`No timeline at ${f}. Run "uatp record" first.`);
  return JSON.parse(readFileSync(f, 'utf8'));
}

export function readResult(dir: string): Result {
  const f = resultPath(dir);
  if (!existsSync(f)) throw new Error(`No result at ${f}. Run "uatp record" first.`);
  return JSON.parse(readFileSync(f, 'utf8'));
}

export function writeJson(file: string, data: unknown) {
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

/**
 * Derive overall pass/fail from the per-item results and the scenario.
 * An item that never ran counts as a failure: a green video must not hide skipped checks.
 */
export function finalizeResult(sc: Scenario, partial: Omit<Result, 'passed'>): Result {
  const wanted = [...sc.steps.map((s) => s.id), ...sc.expect.map((e) => e.id)];
  const notes = [...(partial.notes ?? [])];
  const items: ItemResult[] = wanted.map((id) => {
    const got = partial.items.find((i) => i.id === id);
    if (!got) {
      notes.push(`${id} never ran`);
      return { id, passed: false, error: 'not run' };
    }
    return got;
  });
  return { ...partial, items, notes, passed: items.every((i) => i.passed) };
}

/** Sort markers by time and keep the first occurrence of each id. */
export function normalizeMarkers(markers: Marker[]): Marker[] {
  const seen = new Set<string>();
  return [...markers]
    .sort((a, b) => a.startMs - b.startMs)
    .filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)))
    .map((m) => ({ ...m, startMs: Math.max(0, Math.round(m.startMs)) }));
}
