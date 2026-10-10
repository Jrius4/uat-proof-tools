import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromEntries, fromStdout } from '../lib/recorders/maestro.ts';

// NOTE: the commands.json shape below is modelled on Maestro's output, not captured from a device run.
// If a real run differs, `parseCommands` returns null and the stdout fallback is used; adjust fromEntries.
const T0 = 1_000_000;
const entries = [
  { command: { launchAppCommand: { appId: 'x', label: '[s1] Open the app' } }, metadata: { status: 'COMPLETED', timestamp: T0 + 500 } },
  { command: { tapOnElement: { selector: { textRegex: 'Email' }, label: '[s2] Enter email' } }, metadata: { status: 'COMPLETED', timestamp: T0 + 2500 } },
  { command: { inputTextCommand: { text: 'x', label: '[s2] Enter email' } }, metadata: { status: 'COMPLETED', timestamp: T0 + 3000 } },
  { command: { assertConditionCommand: { condition: {}, label: '[e1] Welcome shown' } }, metadata: { status: 'FAILED', timestamp: T0 + 6000, error: { message: 'Assertion is false' } } },
  { command: { backPressCommand: {} }, metadata: { status: 'COMPLETED', timestamp: T0 + 7000 } },
];

test('labelled commands become markers relative to recording start, first occurrence wins', () => {
  const r = fromEntries(entries as any, T0)!;
  assert.deepEqual(r.markers, [{ id: 's1', startMs: 500 }, { id: 's2', startMs: 2500 }, { id: 'e1', startMs: 6000 }]);
});

test('a failed command fails its item and keeps the reason; others pass', () => {
  const r = fromEntries(entries as any, T0)!;
  assert.equal(r.items.find((i) => i.id === 's2')!.passed, true);
  const e1 = r.items.find((i) => i.id === 'e1')!;
  assert.equal(e1.passed, false);
  assert.match(e1.error!, /Assertion is false/);
});

test('no labelled commands → null so the caller can fall back', () => {
  assert.equal(fromEntries([{ command: { backPressCommand: {} }, metadata: { status: 'COMPLETED', timestamp: 1 } }] as any, 0), null);
});

test('stdout fallback uses arrival time and blames the last item on a failing exit', () => {
  const lines = [{ t: T0 + 100, line: ' [s1] Open the app... COMPLETED' }, { t: T0 + 2000, line: ' [e1] Welcome shown... RUNNING' }];
  const r = fromStdout(lines, T0, 1)!;
  assert.deepEqual(r.markers, [{ id: 's1', startMs: 100 }, { id: 'e1', startMs: 2000 }]);
  assert.deepEqual(r.items.map((i) => i.passed), [true, false]);
});

import { tapsFromLog } from '../lib/recorders/maestro.ts';

test('tap coordinates and times are read from the Maestro log and scaled', () => {
  const day = new Date(2026, 9, 10, 18, 29, 40);
  const start = day.getTime();
  const log = [
    '18:29:46.375 [ INFO] maestro.cli.runner.CliConsoleListener.onCommandStart: [s2] Tap RUNNING',
    '18:29:48.783 [ INFO] maestro.Maestro.hierarchyBasedTap-ogj28Uc: Tapping at (365, 1912) using hierarchy based logic for wait',
  ].join('\n');
  assert.deepEqual(tapsFromLog(log, start, { x: 0.5, y: 0.5 }), [{ atMs: 8783, x: 183, y: 956 }]);
});

test('log lines from before the recording started are dropped', () => {
  const start = new Date(2026, 9, 10, 18, 30, 0).getTime();
  assert.deepEqual(tapsFromLog('18:29:48.783 [ INFO] x: Tapping at (1, 2)', start), []);
});
