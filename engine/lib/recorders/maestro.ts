import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Config } from '../config.ts';
import type { Scenario } from '../scenario.ts';
import type { ItemResult, Marker, Tap } from '../timeline.ts';
import { spawnLogged } from '../util.ts';

const ID_RE = /\[((?:s|e)\d+)\]/;

export function findFlow(cfg: Config, scenario: Scenario, platform: string): string {
  const dir = resolve(cfg.projectDir, cfg.flowsDir);
  for (const name of [`${scenario.id}.${platform}.yaml`, `${scenario.id}.yaml`]) {
    const f = join(dir, name);
    if (existsSync(f)) return f;
  }
  throw new Error(`No Maestro flow for ${scenario.id} in ${dir} (tried ${scenario.id}.${platform}.yaml and ${scenario.id}.yaml). Generate it with the uat-drivers skill.`);
}

/** -e K=V for every ${VAR} the flow references, taken from the environment. Values are never logged. */
export function flowEnvArgs(flowFile: string, extra: Record<string, string> = {}): string[] {
  const vars = new Set([...readFileSync(flowFile, 'utf8').matchAll(/\$\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]));
  const args: string[] = [];
  for (const v of vars) {
    const val = extra[v] ?? process.env[v];
    if (val !== undefined) args.push('-e', `${v}=${val}`);
  }
  return args;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}

type CmdEntry = { command?: unknown; metadata?: { status?: string; timestamp?: number; error?: { message?: string } | string } };

/**
 * Read Maestro's commands.json and turn labelled commands ("[s2] Enter email") into markers and per-item results.
 * Returns null if no labelled command is found so the caller can fall back to stdout timing.
 */
export function parseCommands(testOutputDir: string, recordingStartEpochMs: number): { markers: Marker[]; items: ItemResult[] } | null {
  if (!existsSync(testOutputDir)) return null;
  const file = walk(testOutputDir).find((f) => /commands.*\.json$/.test(f));
  if (!file) return null;
  let entries: CmdEntry[];
  try {
    entries = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
  return fromEntries(entries, recordingStartEpochMs);
}

export function fromEntries(entries: CmdEntry[], recordingStartEpochMs: number): { markers: Marker[]; items: ItemResult[] } | null {
  const first = new Map<string, number>();
  const status = new Map<string, { ok: boolean; error?: string }>();
  for (const e of entries) {
    const id = ID_RE.exec(JSON.stringify(e.command ?? e))?.[1];
    if (!id) continue;
    const ts = e.metadata?.timestamp;
    if (typeof ts === 'number' && !first.has(id)) first.set(id, ts);
    const st = String(e.metadata?.status ?? '').toUpperCase();
    const ok = st === 'COMPLETED' || st === 'SKIPPED' || st === 'WARNED';
    const prev = status.get(id);
    const err = typeof e.metadata?.error === 'string' ? e.metadata.error : e.metadata?.error?.message;
    status.set(id, { ok: (prev?.ok ?? true) && ok, error: prev?.error ?? (ok ? undefined : err ?? st) });
  }
  if (!first.size) return null;
  return {
    markers: [...first].map(([id, ts]) => ({ id, startMs: ts - recordingStartEpochMs })),
    items: [...status].map(([id, s]) => ({ id, passed: s.ok, ...(s.error ? { error: s.error } : {}) })),
  };
}

/** Fallback: Maestro prints labels as it runs; use when arrival time of the line is the best signal we have. */
export function fromStdout(lines: { t: number; line: string }[], recordingStartEpochMs: number, exitCode: number): { markers: Marker[]; items: ItemResult[] } | null {
  const first = new Map<string, number>();
  const failed = new Set<string>();
  for (const { t, line } of lines) {
    const id = ID_RE.exec(line)?.[1];
    if (!id) continue;
    if (!first.has(id)) first.set(id, t);
    if (/FAILED/.test(line)) failed.add(id);
  }
  if (!first.size) return null;
  const ids = [...first.keys()];
  return {
    markers: ids.map((id) => ({ id, startMs: first.get(id)! - recordingStartEpochMs })),
    // Without per-command status, a failing exit marks the last labelled item as the failure.
    items: ids.map((id, i) => ({ id, passed: !failed.has(id) && !(exitCode !== 0 && i === ids.length - 1) })),
  };
}

export function startMaestro(opts: { flow: string; testOutputDir: string; junit: string; device?: string; cwd: string }) {
  const args = ['test', '--test-output-dir', opts.testOutputDir, '--format', 'JUNIT', '--output', opts.junit, ...(opts.device ? ['--udid', opts.device] : []), ...flowEnvArgs(opts.flow), opts.flow];
  return spawnLogged('maestro', args, { cwd: opts.cwd });
}

/**
 * Tap positions from Maestro's own log: "HH:mm:ss.SSS [ INFO] … Tapping at (365, 1912) …" (Android) or "… Try tapping at (91, 359) …" (iOS).
 * Log times are local clock with no date, so they are anchored to the day of the recording start.
 * Coordinates are device pixels on Android and points on iOS; `scale` converts them to the recording's pixel space.
 */
export function parseTaps(testOutputDir: string, recordingStartEpochMs: number, scale = { x: 1, y: 1 }): Tap[] {
  if (!existsSync(testOutputDir)) return [];
  const file = walk(testOutputDir).find((f) => /maestro\.log$/.test(f));
  if (!file) return [];
  return tapsFromLog(readFileSync(file, 'utf8'), recordingStartEpochMs, scale);
}

export function tapsFromLog(log: string, recordingStartEpochMs: number, scale = { x: 1, y: 1 }): Tap[] {
  const taps: Tap[] = [];
  const day = new Date(recordingStartEpochMs);
  for (const line of log.split('\n')) {
    const m = /^(\d{2}):(\d{2}):(\d{2})[.:](\d{3})\b.*[Tt]apping at \((\d+), ?(\d+)\)/.exec(line);
    if (!m) continue;
    const t = new Date(day);
    t.setHours(+m[1], +m[2], +m[3], +m[4]);
    let epoch = t.getTime();
    if (epoch < recordingStartEpochMs - 12 * 3600_000) epoch += 24 * 3600_000; // crossed midnight
    taps.push({ atMs: epoch - recordingStartEpochMs, x: Math.round(+m[5] * scale.x), y: Math.round(+m[6] * scale.y) });
  }
  return taps.filter((t) => t.atMs >= 0);
}
