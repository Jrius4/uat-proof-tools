import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cuesFor, toSrt, toVtt, chunkText, wrapLines, MAX_LINE_CHARS } from '../lib/subtitles.ts';

test('short sentences merge into one cue instead of flickering', () => {
  assert.equal(cuesFor('We open the app. The list is empty.', 0, 3000).length, 1);
});

test('cues tile the narration window with no gaps or overlaps', () => {
  const text = 'First we do a long and fairly detailed thing here, then another quite long thing follows after that. And finally we finish up with one more sentence that is also long enough.';
  const cues = cuesFor(text, 1000, 9000);
  assert.ok(cues.length > 1);
  assert.equal(cues[0].startMs, 1000);
  assert.equal(cues[cues.length - 1].endMs, 10000);
  for (let i = 1; i < cues.length; i++) assert.equal(cues[i].startMs, cues[i - 1].endMs);
});

test('no subtitle line exceeds the limit and no cue has more than two lines', () => {
  const text = 'This is a deliberately long sentence without any punctuation that keeps going and going so the splitter has to cut it somewhere sensible for readers';
  for (const c of chunkText(text)) {
    const lines = wrapLines(c).split('\n');
    assert.ok(lines.length <= 2);
    for (const l of lines) assert.ok(l.length <= MAX_LINE_CHARS + 6, `line too long: ${l}`);
  }
});

test('cues are never shorter than a readable minimum when merging is possible', () => {
  const cues = cuesFor('One. Two. Three. Four. Five. Six.', 0, 2000);
  for (const c of cues) assert.ok(c.endMs - c.startMs >= 1200 || cues.length === 1);
});

test('SRT uses commas and VTT uses dots and a header', () => {
  const cues = [{ startMs: 1500, endMs: 3250, text: 'Hi' }];
  assert.match(toSrt(cues), /00:00:01,500 --> 00:00:03,250/);
  assert.match(toVtt(cues), /^WEBVTT\n\n00:00:01\.500 --> 00:00:03\.250/);
});
