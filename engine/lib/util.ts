import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ENGINE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PLUGIN_ROOT = resolve(ENGINE_DIR, '..');

export type RunResult = { code: number; stdout: string; stderr: string };

/** Run a command to completion and capture output. Never throws on non-zero exit. */
export function run(cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv; input?: string } = {}): RunResult {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    input: opts.input,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  return { code: r.status ?? (r.error ? 127 : 1), stdout: r.stdout ?? '', stderr: (r.stderr ?? '') + (r.error ? String(r.error) : '') };
}

/** Run a command, throwing with its stderr tail if it fails. */
export function runOrThrow(cmd: string, args: string[], opts: Parameters<typeof run>[2] = {}): RunResult {
  const r = run(cmd, args, opts);
  if (r.code !== 0) {
    const tail = (r.stderr || r.stdout).split('\n').slice(-15).join('\n');
    throw new Error(`${cmd} ${args.slice(0, 6).join(' ')}… exited ${r.code}\n${tail}`);
  }
  return r;
}

export function which(cmd: string): string | null {
  const r = run('/usr/bin/which', [cmd]);
  return r.code === 0 ? r.stdout.trim() : null;
}

export function sha(...parts: string[]): string {
  return createHash('sha1').update(parts.join('\u0000')).digest('hex').slice(0, 16);
}

export function ensureDir(p: string): string {
  mkdirSync(p, { recursive: true });
  return p;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function ffprobeDuration(file: string): number {
  const r = runOrThrow('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
  return Math.round(parseFloat(r.stdout) * 1000);
}

export function ffprobeSize(file: string): { width: number; height: number } {
  const r = runOrThrow('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=s=x:p=0', file]);
  const [w, h] = r.stdout.trim().split('x').map(Number);
  return { width: w, height: h };
}

export function runId(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Directory holding one scenario/platform's artifacts for a given run. */
export function runDir(evidenceDir: string, run: string, scenarioId: string, platform: string): string {
  return join(evidenceDir, run, scenarioId, platform);
}

/** Newest run id under evidenceDir that has a timeline for this scenario/platform. */
export function latestRun(evidenceDir: string, scenarioId: string, platform: string): string | null {
  if (!existsSync(evidenceDir)) return null;
  const runs = readdirSync(evidenceDir)
    .filter((d) => existsSync(join(evidenceDir, d, scenarioId, platform, 'timeline.json')))
    .sort();
  return runs.length ? runs[runs.length - 1] : null;
}

export function spawnLogged(cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  const child = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  /** Output lines with the wall-clock time each arrived; used when a tool gives no machine-readable timing. */
  const lineTimes: { t: number; line: string }[] = [];
  let partial = '';
  const onData = (d: Buffer) => {
    const s = String(d);
    output += s;
    const parts = (partial + s).split(/\r?\n|\r/);
    partial = parts.pop() ?? '';
    const t = Date.now();
    for (const line of parts) lineTimes.push({ t, line });
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  const exited = new Promise<number>((res) => child.on('close', (c) => res(c ?? 1)));
  child.on('error', (e) => {
    output += String(e);
  });
  return { child, exited, getOutput: () => output, lineTimes };
}

/** Wait until `pattern` shows up in a spawned process's output, or it exits, or timeout. */
export async function waitForOutput(p: ReturnType<typeof spawnLogged>, pattern: RegExp, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  let exited = false;
  p.exited.then(() => (exited = true));
  while (Date.now() - start < timeoutMs) {
    if (pattern.test(p.getOutput())) return true;
    if (exited) return false;
    await sleep(50);
  }
  return false;
}

/** SIGINT a recorder and wait for it to finalize its file. */
export async function stopGracefully(p: ReturnType<typeof spawnLogged>, timeoutMs = 20000): Promise<void> {
  p.child.kill('SIGINT');
  const t = setTimeout(() => p.child.kill('SIGKILL'), timeoutMs);
  await p.exited;
  clearTimeout(t);
}

export function log(msg: string) {
  process.stderr.write(`[uatp] ${msg}\n`);
}
