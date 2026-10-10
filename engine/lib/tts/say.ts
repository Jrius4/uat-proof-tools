import { rmSync } from 'node:fs';
import { runOrThrow } from '../util.ts';
import type { Config } from '../config.ts';

/** macOS built-in `say`. Zero install; list voices with `say -v '?'`. */
export function synthSay(cfg: Config, text: string, outFile: string): void {
  const aiff = outFile.replace(/\.wav$/, '.aiff');
  runOrThrow('say', ['-v', cfg.tts.voice, '-r', String(cfg.tts.rate), '-o', aiff, '-f', '-'], { input: text });
  runOrThrow('ffmpeg', ['-y', '-loglevel', 'error', '-i', aiff, '-ar', '48000', '-ac', '1', outFile]);
  rmSync(aiff, { force: true });
}
