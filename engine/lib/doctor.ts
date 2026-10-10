import { connect } from 'node:net';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import type { Config } from './config.ts';
import { run, which } from './util.ts';

type Check = { name: string; level: 'ok' | 'warn' | 'fail'; detail: string; fix?: string };

function tcpOpen(host: string, port: number, ms = 1500): Promise<boolean> {
  return new Promise((res) => {
    const s = connect({ host, port });
    const done = (v: boolean) => (s.destroy(), res(v));
    s.setTimeout(ms, () => done(false));
    s.on('connect', () => done(true));
    s.on('error', () => done(false));
  });
}

export async function doctor(cfg: Config): Promise<{ checks: Check[]; ok: boolean }> {
  const c: Check[] = [];
  const add = (name: string, level: Check['level'], detail: string, fix?: string) => c.push({ name, level, detail, fix });

  const major = Number(process.versions.node.split('.')[0]);
  major >= 22 ? add('node', 'ok', process.version) : add('node', 'fail', process.version, 'Node 22.6+ is needed to run .ts files directly');

  // Core: needed for every platform.
  if (!which('ffmpeg') || !which('ffprobe')) add('ffmpeg', 'fail', 'ffmpeg/ffprobe not on PATH', 'brew install ffmpeg');
  else {
    const enc = run('ffmpeg', ['-hide_banner', '-encoders']).stdout;
    const flt = run('ffmpeg', ['-hide_banner', '-filters']).stdout;
    const missing = [!/libx264/.test(enc) && 'libx264', ...['overlay', 'adelay', 'apad', 'tpad', 'loudnorm'].filter((f) => !new RegExp(`\\s${f}\\s`).test(flt))].filter(Boolean);
    const ver = run('ffmpeg', ['-version']).stdout.split('\n')[0];
    missing.length ? add('ffmpeg', 'fail', `missing: ${missing.join(', ')}`, 'Install a full ffmpeg build') : add('ffmpeg', 'ok', ver);
  }

  try {
    existsSync(chromium.executablePath()) ? add('playwright chromium', 'ok', 'installed') : add('playwright chromium', 'fail', 'browser missing', 'npx playwright install chromium');
  } catch (e) {
    add('playwright chromium', 'fail', String(e), 'npx playwright install chromium');
  }

  // TTS
  if (cfg.tts.engine === 'say') {
    const v = run('say', ['-v', '?']);
    v.code !== 0 ? add('tts (say)', 'fail', 'say not available (macOS only)', 'Set tts.engine: piper') :
      new RegExp(`^${cfg.tts.voice}\\s`, 'm').test(v.stdout) ? add('tts (say)', 'ok', `voice ${cfg.tts.voice}`) : add('tts (say)', 'fail', `voice "${cfg.tts.voice}" not installed`, "Pick one from `say -v '?'` (en_US) and set tts.voice");
  } else {
    which('piper') && cfg.tts.piperModel && existsSync(cfg.tts.piperModel) ? add('tts (piper)', 'ok', cfg.tts.piperModel) : add('tts (piper)', 'fail', 'piper or model missing', 'Install piper and set tts.piperModel');
  }

  // Mobile
  const maestro = which('maestro');
  const java = run('java', ['-version']);
  maestro ? add('maestro', 'ok', run('maestro', ['--version']).stdout.trim().split('\n').pop() ?? '') : add('maestro', 'warn', 'not installed (needed for android/ios)', 'curl -Ls https://get.maestro.mobile.dev | bash');
  if (maestro) {
    const jv = /version "(\d+)/.exec(java.stderr + java.stdout)?.[1];
    jv && Number(jv) >= 17 ? add('java', 'ok', `v${jv}`) : add('java', 'warn', 'Java 17+ needed by Maestro');
  }
  if (which('adb')) {
    const devs = run('adb', ['devices']).stdout.split('\n').slice(1).filter((l) => /\tdevice$/.test(l)).map((l) => l.split('\t')[0]);
    devs.length ? add('android device', 'ok', devs.join(', ')) : add('android device', 'warn', 'no device/emulator connected', 'Start an emulator or plug in a phone with USB debugging');
  } else add('adb', 'warn', 'not on PATH (android only)');
  which('scrcpy') ? add('scrcpy', 'ok', run('scrcpy', ['--version']).stdout.split('\n')[0]) : add('scrcpy', 'warn', 'not installed (android only)', 'brew install scrcpy');
  if (run('xcrun', ['--version']).code === 0) {
    const booted = run('xcrun', ['simctl', 'list', 'devices', 'booted']).stdout.split('\n').filter((l) => /\(Booted\)/.test(l)).map((l) => l.trim());
    booted.length ? add('ios simulator', 'ok', booted[0]) : add('ios simulator', 'warn', 'no booted simulator', 'xcrun simctl boot "<device name>" && open -a Simulator');
  } else add('xcrun', 'warn', 'Xcode tools missing (ios only)');

  // Desktop
  (await tcpOpen(cfg.obs.host, cfg.obs.port))
    ? add('obs websocket', process.env[cfg.obs.passwordEnv] ? 'ok' : 'warn', process.env[cfg.obs.passwordEnv] ? `${cfg.obs.host}:${cfg.obs.port}` : `reachable, but $${cfg.obs.passwordEnv} is not set`)
    : add('obs websocket', 'warn', `nothing on ${cfg.obs.host}:${cfg.obs.port} (desktop only)`, 'Open OBS → Tools → WebSocket Server Settings → enable');

  return { checks: c, ok: !c.some((x) => x.level === 'fail') };
}

export function printDoctor(checks: Check[]) {
  const icon = { ok: '✓', warn: '!', fail: '✗' } as const;
  for (const k of checks) console.log(`${icon[k.level]} ${k.name.padEnd(20)} ${k.detail}${k.fix && k.level !== 'ok' ? `\n    fix: ${k.fix}` : ''}`);
}
