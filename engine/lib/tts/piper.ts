import { rmSync } from 'node:fs';
import { runOrThrow, which } from '../util.ts';
import type { Config } from '../config.ts';

/**
 * Piper adapter (open source, runs on CPU). Verified with piper-tts 1.8.0 on Python 3.12 (not 3.15: no onnxruntime
 * wheels). Install Piper, download a voice, then set in uatp.config.yaml:
 *   tts: { engine: piper, piperModel: /path/to/en_US-voice.onnx }
 * Check the voice model's own license before distributing videos made with it.
 */
export function synthPiper(cfg: Config, text: string, outFile: string): void {
  if (!which('piper')) throw new Error('piper not found on PATH. Install it or set tts.engine: say');
  if (!cfg.tts.piperModel) throw new Error('tts.piperModel is required when tts.engine is piper');
  const raw = outFile.replace(/\.wav$/, '.piper.wav');
  try {
    runOrThrow('piper', ['--model', cfg.tts.piperModel, '--output_file', raw], { input: text });
  } catch (e) {
    // espeak-ng keeps its data path in a ~160-byte buffer; a deep install path is cut short and "phontab" goes missing.
    if (/phontab/.test(String(e))) {
      throw new Error(`${e}\n\nPiper's espeak-ng data path is probably too long (limit is about 160 characters). Install Piper in a shorter directory, e.g. ~/piper-venv, and put it first on PATH.`);
    }
    throw e;
  }
  runOrThrow('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-ar', '48000', '-ac', '1', outFile]);
  rmSync(raw, { force: true });
}
