import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CfrWriter } from '../playwright/cdp-recorder.ts';

const record = (fps: number) => {
  const out: string[] = [];
  return { out, w: new CfrWriter<string>(fps, (f) => out.push(f)) };
};

test('a frame is held for every slot until the next frame arrives', () => {
  const { out, w } = record(10);
  w.push(0, 'a');
  w.push(350, 'b'); // a covers slots 0-2
  w.finish(500); // b covers slots 3-4
  assert.deepEqual(out, ['a', 'a', 'a', 'b', 'b']);
});

test('frames landing in the same slot keep only the newest', () => {
  const { out, w } = record(10);
  w.push(0, 'a');
  w.push(20, 'b');
  w.push(40, 'c');
  w.push(100, 'd');
  w.finish(200);
  assert.deepEqual(out, ['c', 'd']);
});

test('the video lasts until stop even when the screen stops changing', () => {
  const { out, w } = record(30);
  w.push(0, 'a');
  w.finish(1000);
  assert.equal(out.length, 30);
});

test('the last frame is written even when stop comes in the same slot', () => {
  const { out, w } = record(10);
  w.push(0, 'a');
  w.push(310, 'b');
  w.finish(320);
  assert.deepEqual(out, ['a', 'a', 'a', 'b']);
});

test('nothing is written before the first frame', () => {
  const { out, w } = record(10);
  w.finish(500);
  assert.equal(w.frames, 0);
  assert.deepEqual(out, []);
});
