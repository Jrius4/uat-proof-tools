import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RecordContext } from './types.ts';
import { findFlow, fromStdout, parseCommands, parseTaps, startMaestro } from './maestro.ts';
import { ffprobeSize, log, run, sleep, spawnLogged, stopGracefully } from '../util.ts';
import { finalizeResult, normalizeMarkers, resultPath, timelinePath, writeJson } from '../timeline.ts';

type Screen = { start(rawFile: string): ReturnType<typeof spawnLogged>; readyPattern: RegExp; label: string };

/**
 * Know when the recorder is really capturing. scrcpy's "Recording started" line goes to a block-buffered stdout,
 * so over a pipe it only appears when the process exits (a real-device run mis-aligned the timeline by ~30 s).
 * The output file appearing with data is the reliable signal; the log line is accepted too if it does arrive.
 */
async function waitForRecordingStart(rec: ReturnType<typeof spawnLogged>, file: string, pattern: RegExp, timeoutMs: number): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (existsSync(file) && statSync(file).size > 0) return true;
    if (pattern.test(rec.getOutput())) return true;
    if (rec.child.exitCode !== null) return false;
    await sleep(25);
  }
  return false;
}

/** Recording pixels per Maestro coordinate unit, Android (device pixels). */
function androidScale(serial: string, vid: { width: number; height: number }): { x: number; y: number } | null {
  const dev = deviceSize(serial);
  return dev ? { x: vid.width / dev.width, y: vid.height / dev.height } : null;
}

/**
 * Recording pixels per Maestro coordinate unit, iOS (points). The simulator's device-type profile lists the
 * screen's pixel size and scale (iPhone 16: 1179x2556 at 3x), so points = pixels / scale.
 */
function iosScale(udid: string, vid: { width: number; height: number }): { x: number; y: number } | null {
  try {
    const list = JSON.parse(run('xcrun', ['simctl', 'list', 'devices', '-j']).stdout).devices as Record<string, { udid: string; deviceTypeIdentifier: string }[]>;
    const typeId = Object.values(list).flat().find((d) => d.udid === udid)?.deviceTypeIdentifier;
    const types = JSON.parse(run('xcrun', ['simctl', 'list', 'devicetypes', '-j']).stdout).devicetypes as { identifier: string; bundlePath: string }[];
    const bundle = types.find((t) => t.identifier === typeId)?.bundlePath;
    if (!bundle) return null;
    const prof = JSON.parse(run('plutil', ['-convert', 'json', '-o', '-', `${bundle}/Contents/Resources/profile.plist`]).stdout);
    const { mainScreenWidth: w, mainScreenHeight: h, mainScreenScale: sc } = prof;
    return w && h && sc ? { x: (vid.width / w) * sc, y: (vid.height / h) * sc } : null;
  } catch {
    return null;
  }
}

/** Screen size in pixels as Android reports it (an "Override size" wins over "Physical size"). */
function deviceSize(serial: string): { width: number; height: number } | null {
  const out = run('adb', ['-s', serial, 'shell', 'wm', 'size']).stdout;
  const m = /Override size: (\d+)x(\d+)/.exec(out) ?? /Physical size: (\d+)x(\d+)/.exec(out);
  return m ? { width: +m[1], height: +m[2] } : null;
}

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
  const ready = await waitForRecordingStart(rec, rawFile, screen.readyPattern, 30000);
  const recordingStart = Date.now();
  if (!ready) {
    if (rec.child.exitCode !== null) throw new Error(`${screen.label} exited early:\n${rec.getOutput().slice(-800)}`);
    notes.push(`${screen.label} produced no video file within 30 s; timeline may be misaligned`);
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

  // Maestro logs tap coordinates in device pixels (Android) or points (iOS); convert to the recording's pixels.
  const vid = ffprobeSize(rawFile);
  const factor = platform === 'android' ? androidScale(device!, vid) : iosScale(device!, vid);
  let taps: ReturnType<typeof parseTaps> = [];
  if (factor) taps = parseTaps(testOut, recordingStart, factor);
  else notes.push('could not work out the screen scale; tap markers skipped');
  writeJson(timelinePath(outDir), { scenarioId: scenario.id, platform, video: 'raw.mp4', markers: normalizeMarkers(parsed.markers), taps });
  const result = finalizeResult(scenario, { scenarioId: scenario.id, platform, runner: 'maestro', startedAt, items: parsed.items, notes });
  if (code !== 0) result.passed = false;
  writeJson(resultPath(outDir), result);
}

export const recordAndroid = (ctx: RecordContext) => recordMobile(ctx, 'android');
export const recordIos = (ctx: RecordContext) => recordMobile(ctx, 'ios');
