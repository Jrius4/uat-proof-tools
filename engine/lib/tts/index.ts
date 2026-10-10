import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '../config.ts';
import { ensureDir, ffprobeDuration, sha } from '../util.ts';
import { synthSay } from './say.ts';
import { synthPiper } from './piper.ts';

export type Clip = { file: string; durationMs: number };

/** Engine adapters write a 48 kHz mono WAV to `outFile`. */
export type SynthFn = (cfg: Config, text: string, outFile: string) => void;

const ENGINES: Record<string, SynthFn> = { say: synthSay, piper: synthPiper };

/** Speak text to a cached WAV. Same text + voice + rate never re-synthesizes. */
export function speak(cfg: Config, text: string, cacheDir: string): Clip {
  const engine = ENGINES[cfg.tts.engine];
  if (!engine) throw new Error(`Unknown tts.engine "${cfg.tts.engine}". Use one of: ${Object.keys(ENGINES).join(', ')}`);
  ensureDir(cacheDir);
  const key = sha(cfg.tts.engine, cfg.tts.voice, String(cfg.tts.rate), cfg.tts.piperModel ?? '', text);
  const file = join(cacheDir, `${key}.wav`);
  if (!existsSync(file)) engine(cfg, text, file);
  return { file, durationMs: ffprobeDuration(file) };
}
