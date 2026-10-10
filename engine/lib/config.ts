import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';

export type ProfileName = 'stakeholder' | 'qa';

export type Profile = {
  titleCardMs: number;
  endCardMs: number;
  narration: boolean;
  burnSubtitles: boolean;
  softSubtitles: boolean;
  stepBadge: boolean;
  assertionFreezeMs: number;
  /** Extra silence after narration finishes, before the next step starts. */
  breathingMs: number;
  /** Leading hold on each step so viewers see the screen before narration starts. */
  leadInMs: number;
  /** Steps whose idle wait exceeds this are sped up (0 = never). */
  speedUpIdleOverMs: number;
  speedUpFactor: number;
  titleStyle: 'plain' | 'technical';
  endStyle: 'plain' | 'technical';
};

export type Config = {
  projectDir: string;
  scenariosDir: string;
  evidenceDir: string;
  testsDir: string;
  flowsDir: string;
  tts: { engine: 'say' | 'piper'; voice: string; rate: number; piperModel?: string };
  render: { fps: number; maxWidth: number; crf: number; tapLagMs: number; tapShowMs: number };
  /** Added to every timeline offset; calibrate if narration lands early/late. */
  syncOffsetMs: Record<string, number>;
  devices: { android?: string; ios?: string };
  obs: { host: string; port: number; passwordEnv: string };
  profiles: Record<ProfileName, Profile>;
};

export const DEFAULTS: Omit<Config, 'projectDir'> = {
  scenariosDir: 'uat/scenarios',
  evidenceDir: 'evidence',
  testsDir: 'tests/uat',
  flowsDir: 'flows/uat',
  tts: { engine: 'say', voice: 'Samantha', rate: 165 },
  render: { fps: 30, maxWidth: 1920, crf: 20, tapLagMs: 650, tapShowMs: 800 },
  syncOffsetMs: { web: 0, android: 0, ios: 0, desktop: 0 },
  devices: {},
  obs: { host: '127.0.0.1', port: 4455, passwordEnv: 'OBS_WS_PASSWORD' },
  profiles: {
    stakeholder: {
      titleCardMs: 3000,
      endCardMs: 3500,
      narration: true,
      burnSubtitles: true,
      softSubtitles: true,
      stepBadge: false,
      assertionFreezeMs: 1500,
      breathingMs: 600,
      leadInMs: 400,
      speedUpIdleOverMs: 0,
      speedUpFactor: 1,
      titleStyle: 'plain',
      endStyle: 'plain',
    },
    qa: {
      titleCardMs: 2000,
      endCardMs: 3000,
      narration: true,
      burnSubtitles: false,
      softSubtitles: true,
      stepBadge: true,
      assertionFreezeMs: 1200,
      breathingMs: 200,
      leadInMs: 200,
      speedUpIdleOverMs: 4000,
      speedUpFactor: 4,
      titleStyle: 'technical',
      endStyle: 'technical',
    },
  },
};

function deepMerge<T>(base: T, over: any): T {
  if (over === null || typeof over !== 'object' || Array.isArray(over)) return (over ?? base) as T;
  const out: any = { ...(base as any) };
  for (const k of Object.keys(over)) out[k] = k in out && typeof out[k] === 'object' && !Array.isArray(out[k]) ? deepMerge(out[k], over[k]) : over[k];
  return out;
}

export function loadConfig(projectDir: string): Config {
  const dir = resolve(projectDir);
  const file = ['uatp.config.yaml', 'uatp.config.yml'].map((f) => join(dir, f)).find(existsSync);
  const user = file ? parse(readFileSync(file, 'utf8')) ?? {} : {};
  return { ...(deepMerge(DEFAULTS, user) as Omit<Config, 'projectDir'>), projectDir: dir };
}
