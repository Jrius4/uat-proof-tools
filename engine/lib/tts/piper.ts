import { runOrThrow, which } from '../util.ts';
import type { Config } from '../config.ts';

/**
 * Piper adapter (open source, runs on CPU). Not exercised on the author's machine yet:
 * install Piper, download a voice, then set in uatp.config.yaml:
 *   tts: { engine: piper, piperModel: /path/to/en_US-voice.onnx }
 * Check the voice model's own license before distributing videos made with it.
 */
export function synthPiper(cfg: Config, text: string, outFile: string): void {
  if (!which('piper')) throw new Error('piper not found on PATH. Install it or set tts.engine: say');
  if (!cfg.tts.piperModel) throw new Error('tts.piperModel is required when tts.engine is piper');
  const raw = outFile.replace(/\.wav$/, '.piper.wav');
  runOrThrow('piper', ['--model', cfg.tts.piperModel, '--output_file', raw], { input: text });
  runOrThrow('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-ar', '48000', '-ac', '1', outFile]);
}
