import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RecordContext } from './types.ts';
import { findFlow, fromStdout, parseCommands, startMaestro } from './maestro.ts';
import { log, run, sleep, spawnLogged, stopGracefully, waitForOutput } from '../util.ts';
import { finalizeResult, normalizeMarkers, resultPath, timelinePath, writeJson } from '../timeline.ts';

type Screen = { start(rawFile: string): ReturnType<typeof spawnLogged>; readyPattern: RegExp; label: string };

function androidSerial(preferred?: string): string | undefined {
  if (preferred) return preferred;
  const devs = run('adb', ['devices']).stdout.split('\n').slice(1).filter((l) => /\tdevice$/.test(l)).map((l) => l.split('\t')[0]);
  if (devs.length > 1) throw new Error(`Several Android devices connected (${devs.join(', ')}). Set devices.android in uatp.config.yaml.`);
  if (!devs.length) throw new Error('No Android device or emulator is connected (adb devices).');
  return devs[0];
}

function iosUdid(preferred?: string): string {
  if (preferred) return preferred;
  const booted = run('xcrun', ['simctl', 'list', 'devices', 'booted']).stdout.split('\n').map((l) => /\(([0-9A-F-]{36})\) \(Booted\)/.exec(l)?.[1]).filter(Boolean) as string[];
  if (booted.length !== 1) throw new Error(booted.length ? `Several booted simulators; set devices.ios in uatp.config.yaml.` : 'No booted iOS simulator. Boot one first (xcrun simctl boot …).');
  return booted[0];
}

/**
 * Shared flow for phones: start the screen recorder, run the Maestro flow, stop the recorder,
 * then turn Maestro's labelled commands into a timeline relative to the first recorded moment.
 */
export async function recordMobile(ctx: RecordContext, platform: 'android' | 'ios'): Promise<void> {
  const { cfg, scenario, outDir } = ctx;
  const flow = findFlow(cfg, scenario, platform);
  const device = platform === 'android' ? androidSerial(cfg.devices.android) : iosUdid(cfg.devices.ios);

  const screen: Screen =
    platform === 'android'
      ? {
          label: 'scrcpy',
          readyPattern: /Recording started/i,
          // --show-touches draws a circle under each tap so viewers can follow the action.
          start: (f) => spawnLogged('scrcpy', ['--serial', device!, '--no-window', '--no-audio', '--show-touches', '--record', f, '--record-format', 'mp4']),
        }
      : {
          label: 'simctl',
          readyPattern: /Recording started/i,
          start: (f) => spawnLogged('xcrun', ['simctl', 'io', device, 'recordVideo', '--codec=h264', '--force', f]),
        };

  const rawFile = join(outDir, 'raw.mp4');
  const notes: string[] = [];
  log(`${platform}: recording with ${screen.label}, driving ${flow}`);
  const rec = screen.start(rawFile);
  const ready = await waitForOutput(rec, screen.readyPattern, 30000);
  const recordingStart = Date.now();
  if (!ready) {
    if (rec.child.exitCode !== null) throw new Error(`${screen.label} exited early:\n${rec.getOutput().slice(-800)}`);
    notes.push(`${screen.label} gave no "started" message; assumed recording began after 2 s`);
    await sleep(2000);
  }
  await sleep(500); // let the first frames land so title-card-to-app cut is clean

  const testOut = join(outDir, 'maestro');
  mkdirSync(testOut, { recursive: true });
  const startedAt = new Date().toISOString();
  const m = startMaestro({ flow, testOutputDir: testOut, junit: join(outDir, 'junit.xml'), device, cwd: cfg.projectDir });
  const code = await m.exited;
  await sleep(1000); // keep the final screen in view
  await stopGracefully(rec);
  writeFileSync(join(outDir, 'driver.log'), m.getOutput());
  writeFileSync(join(outDir, 'recorder.log'), rec.getOutput());
  if (!existsSync(rawFile)) throw new Error(`${screen.label} produced no video. See ${join(outDir, 'recorder.log')}`);

  let parsed = parseCommands(testOut, recordingStart);
  if (!parsed) {
    parsed = fromStdout(m.lineTimes, recordingStart, code);
    if (parsed) notes.push('commands.json had no labelled commands; timeline estimated from Maestro output timing (less precise)');
  }
  if (!parsed) throw new Error(`No "[sN]"/"[eN]" labelled commands found in the Maestro run. Every step needs "label: '[s1] …'" in the flow. See ${join(outDir, 'driver.log')}`);

  writeJson(timelinePath(outDir), { scenarioId: scenario.id, platform, video: 'raw.mp4', markers: normalizeMarkers(parsed.markers) });
  const result = finalizeResult(scenario, { scenarioId: scenario.id, platform, runner: 'maestro', startedAt, items: parsed.items, notes });
  if (code !== 0) result.passed = false;
  writeJson(resultPath(outDir), result);
}

export const recordAndroid = (ctx: RecordContext) => recordMobile(ctx, 'android');
export const recordIos = (ctx: RecordContext) => recordMobile(ctx, 'ios');
