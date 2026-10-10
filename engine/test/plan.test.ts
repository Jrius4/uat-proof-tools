import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan } from '../lib/compose.ts';
import type { PlanItem } from '../lib/compose.ts';
import { DEFAULTS } from '../lib/config.ts';

const items = new Map<string, PlanItem>([
  ['s1', { id: 's1', kind: 'step', label: 'Open', narration: 'x' }],
  ['s2', { id: 's2', kind: 'step', label: 'Type', narration: 'y' }],
  ['e1', { id: 'e1', kind: 'check', label: 'Shown', narration: 'z' }],
]);
const markers = [{ id: 's1', startMs: 0 }, { id: 's2', startMs: 2000 }, { id: 'e1', startMs: 4000 }];
const stake = DEFAULTS.profiles.stakeholder;
const qa = DEFAULTS.profiles.qa;

test('segments end where the next marker starts; last runs to end of video', () => {
  const p = buildPlan(items, markers, 6000, { s1: 500, s2: 500, e1: 500 }, {}, stake);
  assert.deepEqual(p.map((s) => [s.srcStartMs, s.srcLenMs]), [[0, 2000], [2000, 2000], [4000, 2000]]);
});

test('narration that fits the recorded step adds no freeze', () => {
  const p = buildPlan(items, markers, 6000, { s1: 1000 }, {}, stake);
  assert.equal(p[0].freezeMs, 0);
  assert.equal(p[0].outDurMs, 2000);
});

test('narration longer than the step freezes the last frame so speech never overlaps the next action', () => {
  const p = buildPlan(items, markers, 6000, { s1: 5000 }, {}, stake);
  const need = stake.leadInMs + 5000 + stake.breathingMs;
  assert.equal(p[0].outDurMs, need);
  assert.equal(p[0].freezeMs, need - 2000);
});

test('checks always hold at least the assertion freeze', () => {
  const short = [{ id: 'e1', startMs: 0 }];
  const p = buildPlan(items, short, 300, {}, {}, stake);
  assert.ok(p[0].outDurMs >= stake.assertionFreezeMs);
});

test('qa profile speeds up long idle steps but never below what narration needs', () => {
  const long = [{ id: 's1', startMs: 0 }, { id: 's2', startMs: 20000 }];
  const p = buildPlan(items, long, 22000, { s1: 1000 }, {}, qa);
  assert.ok(p[0].speed > 1 && p[0].speed <= qa.speedUpFactor);
  assert.ok(p[0].outDurMs >= qa.leadInMs + 1000 + qa.breathingMs);
});

test('stakeholder profile never speeds up', () => {
  const long = [{ id: 's1', startMs: 0 }, { id: 's2', startMs: 20000 }];
  assert.equal(buildPlan(items, long, 22000, {}, {}, stake)[0].speed, 1);
});

test('markers for unknown ids are ignored', () => {
  const p = buildPlan(items, [{ id: 'zzz', startMs: 0 }, { id: 's1', startMs: 100 }], 3000, {}, {}, stake);
  assert.deepEqual(p.map((s) => s.item.id), ['s1']);
});
