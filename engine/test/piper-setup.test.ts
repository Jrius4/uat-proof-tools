import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyPiperModel, expandHome, findPiperModel } from '../lib/tts/piper.ts';
import { DEFAULTS, loadConfig } from '../lib/config.ts';

const home = () => mkdtempSync(join(tmpdir(), 'uatp-home-'));
const withVoices = (h: string, ...files: string[]) => {
  mkdirSync(join(h, 'piper-voices'));
  for (const f of files) writeFileSync(join(h, 'piper-voices', f), '');
};

test('piper is the default engine', () => assert.equal(DEFAULTS.tts.engine, 'piper'));

test('finds the preferred voice in ~/piper-voices, else the first model', () => {
  const a = home();
  withVoices(a, 'a-voice.onnx', 'en_US-lessac-medium.onnx', 'en_US-lessac-medium.onnx.json');
  assert.equal(findPiperModel({ home: a }), join(a, 'piper-voices', 'en_US-lessac-medium.onnx'));
  const b = home();
  withVoices(b, 'z.onnx', 'b.onnx');
  assert.equal(findPiperModel({ home: b }), join(b, 'piper-voices', 'b.onnx'));
});

test('returns undefined when there is no voice folder or no model', () => {
  assert.equal(findPiperModel({ home: home() }), undefined);
  const h = home();
  withVoices(h, 'readme.txt');
  assert.equal(findPiperModel({ home: h }), undefined);
});

test('explicit path beats env beats the folder, and a missing path is an error', () => {
  const h = home();
  withVoices(h, 'en_US-lessac-medium.onnx');
  const mine = join(h, 'mine.onnx');
  const other = join(h, 'other.onnx');
  writeFileSync(mine, '');
  writeFileSync(other, '');
  assert.equal(findPiperModel({ home: h, explicit: mine, env: other }), mine);
  assert.equal(findPiperModel({ home: h, env: other }), other);
  assert.throws(() => findPiperModel({ home: h, explicit: join(h, 'nope.onnx') }), /--piper-model .*does not exist/);
  assert.throws(() => findPiperModel({ home: h, env: join(h, 'nope.onnx') }), /UATP_PIPER_MODEL .*does not exist/);
});

test('applyPiperModel replaces the template line, quoting only when needed', () => {
  const t = 'tts:\n  engine: piper\n  piperModel: /path/to/en_US-voice.onnx   # note\n  rate: 165\n';
  assert.equal(applyPiperModel(t, '/v/a.onnx'), 'tts:\n  engine: piper\n  piperModel: /v/a.onnx\n  rate: 165\n');
  assert.match(applyPiperModel(t, '/v/with #hash.onnx'), /piperModel: "\/v\/with #hash.onnx"/);
  assert.match(applyPiperModel('  # piperModel: /x\n', '/v/a.onnx'), /^ {2}piperModel: \/v\/a.onnx$/m);
  assert.equal(applyPiperModel('nothing here\n', '/v/a.onnx'), 'nothing here\n');
});

test('~ in piperModel is expanded when the config loads', () => {
  assert.equal(expandHome('~/x/y.onnx', '/home/me'), '/home/me/x/y.onnx');
  assert.equal(expandHome('/abs/y.onnx', '/home/me'), '/abs/y.onnx');
  const dir = mkdtempSync(join(tmpdir(), 'uatp-proj-'));
  writeFileSync(join(dir, 'uatp.config.yaml'), 'tts:\n  piperModel: ~/v/y.onnx\n');
  const cfg = loadConfig(dir);
  assert.ok(!cfg.tts.piperModel!.startsWith('~'));
  assert.ok(cfg.tts.piperModel!.endsWith('/v/y.onnx'));
});
