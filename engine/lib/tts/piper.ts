import { existsSync, readdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { runOrThrow, which } from '../util.ts';
import type { Config } from '../config.ts';

/**
 * Piper adapter (open source, runs on CPU). Verified with piper-tts 1.8.0 on Python 3.12 (not 3.15: no onnxruntime
 * wheels). Install Piper, download a voice, then set in uatp.config.yaml:
 *   tts: { engine: piper, piperModel: /path/to/en_US-voice.onnx }
 * Check the voice model's own license before distributing videos made with it.
 */
/** Expand a leading `~/` so config values like `~/piper-voices/x.onnx` work. */
export function expandHome(p: string, home = homedir()): string {
  return p === '~' ? home : p.startsWith('~/') ? join(home, p.slice(2)) : p;
}

const PREFERRED_VOICE = 'en_US-lessac-medium.onnx';

/**
 * Find a Piper voice model for `uatp init`. Order: an explicit path (must exist), then $UATP_PIPER_MODEL
 * (must exist), then `~/piper-voices` (the README's install location): the preferred voice if present, else the first .onnx.
 * Returns undefined when nothing is found. Never downloads anything.
 */
export function findPiperModel(opts: { explicit?: string; env?: string; home?: string } = {}): string | undefined {
  const home = opts.home ?? homedir();
  for (const [label, given] of [['--piper-model', opts.explicit], ['UATP_PIPER_MODEL', opts.env]] as const) {
    if (!given) continue;
    const p = expandHome(given, home);
    if (!existsSync(p)) throw new Error(`${label} points to ${p}, which does not exist`);
    return p;
  }
  const dir = join(home, 'piper-voices');
  if (!existsSync(dir)) return undefined;
  const models = readdirSync(dir).filter((f) => f.endsWith('.onnx')).sort();
  const pick = models.includes(PREFERRED_VOICE) ? PREFERRED_VOICE : models[0];
  return pick ? join(dir, pick) : undefined;
}

/** Set `piperModel` in the config template that `uatp init` copies. Leaves the template alone if there is no such line. */
export function applyPiperModel(template: string, model: string): string {
  const value = /[#:'"]|^\s|\s$/.test(model) ? JSON.stringify(model) : model; // JSON strings are valid YAML
  return template.replace(/^(\s*)#?\s*piperModel:.*$/m, (_m, indent) => `${indent}piperModel: ${value}`);
}

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
