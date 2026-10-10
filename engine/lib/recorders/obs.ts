import { chmodSync, copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { spawn } from 'node:child_process';
import OBSWebSocket from 'obs-websocket-js';
import type { RecordContext } from './types.ts';
import { ENGINE_DIR, log, sleep } from '../util.ts';
import { readMarks } from '../marks.ts';
import { finalizeResult, normalizeMarkers, resultPath, timelinePath, writeJson } from '../timeline.ts';

/**
 * Desktop / any-window recording through OBS's built-in WebSocket server (v5).
 * You set up the OBS scene (window or display capture) once; this starts/stops recording around
 * the scenario's `targets.desktop.command`, which must call `uatp mark <id>` at the start of each step.
 */
export async function recordDesktop({ cfg, scenario, outDir }: RecordContext): Promise<void> {
  const command: string | undefined = scenario.targets?.desktop?.command;
  if (!command) throw new Error('targets.desktop.command is required for platform "desktop"');
  const password = process.env[cfg.obs.passwordEnv];

  // Tiny `uatp` shim so the driver script can just call `uatp mark s1`.
  const binDir = join(outDir, 'bin');
  mkdirSync(binDir, { recursive: true });
  const shim = join(binDir, 'uatp');
  writeFileSync(shim, `#!/bin/sh\nexec node "${join(ENGINE_DIR, 'bin', 'uatp.ts')}" "$@"\n`);
  chmodSync(shim, 0o755);
  const marksFile = join(outDir, 'marks.jsonl');
  writeFileSync(marksFile, '');

  const obs = new OBSWebSocket();
  await obs.connect(`ws://${cfg.obs.host}:${cfg.obs.port}`, password).catch((e: Error) => {
    throw new Error(`Cannot reach OBS at ${cfg.obs.host}:${cfg.obs.port} (${e.message}). Enable Tools → WebSocket Server Settings and export ${cfg.obs.passwordEnv}.`);
  });

  let startEpoch = 0;
  const started = new Promise<void>((res, rej) => {
    const t = setTimeout(() => rej(new Error('OBS did not report recording started within 15 s')), 15000);
    obs.on('RecordStateChanged', (e: { outputState: string }) => {
      if (e.outputState === 'OBS_WEBSOCKET_OUTPUT_STARTED') {
        startEpoch = Date.now();
        clearTimeout(t);
        res();
      }
    });
  });
  const startedAt = new Date().toISOString();
  await obs.call('StartRecord');
  await started;
  log('desktop: OBS recording; running driver command');
  await sleep(500);

  const exit = await new Promise<number>((res) => {
    const child = spawn('sh', ['-c', command], {
      cwd: cfg.projectDir,
      stdio: 'inherit',
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH}`, UATP_MARKS_FILE: marksFile, UATP_SCENARIO_ID: scenario.id },
    });
    child.on('close', (c) => res(c ?? 1));
    child.on('error', () => res(127));
  });
  await sleep(1000);
  const stop = (await obs.call('StopRecord')) as { outputPath?: string };
  await obs.disconnect();
  if (!stop.outputPath || !existsSync(stop.outputPath)) throw new Error('OBS did not return a recording path; check its Output → Recording settings');
  const raw = `raw${extname(stop.outputPath)}`;
  copyFileSync(stop.outputPath, join(outDir, raw));

  const marks = readMarks(marksFile);
  if (!marks.length) throw new Error('The driver never called `uatp mark <id>`; no timeline to build.');
  writeJson(timelinePath(outDir), {
    scenarioId: scenario.id,
    platform: 'desktop',
    video: raw,
    markers: normalizeMarkers(marks.map((m) => ({ id: m.id, startMs: m.epochMs - startEpoch }))),
  });
  const items = [...new Map(marks.map((m) => [m.id, m])).values()].map((m) => ({ id: m.id, passed: m.status !== 'fail' && marks.every((x) => x.id !== m.id || x.status !== 'fail'), ...(m.error ? { error: m.error } : {}) }));
  const result = finalizeResult(scenario, { scenarioId: scenario.id, platform: 'desktop', runner: 'obs+command', startedAt, items, notes: exit !== 0 ? [`driver command exited ${exit}`] : [] });
  if (exit !== 0) result.passed = false;
  writeJson(resultPath(outDir), result);
}
