import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { constantRate } from '../lib/compose.ts';
import { run, runOrThrow } from '../lib/util.ts';

/** Colour of the middle pixel at time t (seconds), decoded from the file. */
function colourAt(file: string, t: number): string {
  const r = run('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', 'scale=8:8,crop=1:1:4:4', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  const px = Buffer.from(r.stdout, 'latin1');
  const [rr, g, b] = [px[0], px[1], px[2]];
  return rr > 150 && g < 100 ? 'red' : g > 100 && rr < 100 ? 'green' : `other(${rr},${g},${b})`;
}

test('a sparse recording (frames only when the screen changes) keeps its timing after cutting', () => {
  const dir = mkdtempSync(join(tmpdir(), 'uatp-cfr-'));
  const sparse = join(dir, 'sparse.mp4');
  // Two frames only: red at t=0, green at t=3 s, like a screen recorder with a static screen in between.
  runOrThrow('ffmpeg', [
    '-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=64x64:r=1:d=2',
    '-vf', "format=rgb24,geq=r='if(eq(N,0),255,0)':g='if(eq(N,0),0,255)':b=0,setpts=N*3/TB,format=yuv420p",
    '-fps_mode', 'passthrough', '-c:v', 'libx264', sparse,
  ]);
  const pts = runOrThrow('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time', '-of', 'csv=p=0', sparse]).stdout.trim().split('\n');
  assert.deepEqual(pts.map(Number), [0, 3], 'fixture must really be sparse');
  const cfr = constantRate(sparse, join(dir, 'cfr.mp4'), 4000, 30);

  // Cut starting at 1 s, inside the static stretch, exactly as a step segment would be.
  const cut = join(dir, 'cut.mp4');
  runOrThrow('ffmpeg', ['-y', '-v', 'error', '-ss', '1', '-t', '3', '-i', cfr, '-vf', 'setpts=PTS-STARTPTS', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', cut]);

  assert.equal(colourAt(cut, 0.2), 'red', 'still red at 1.2 s of the source');
  assert.equal(colourAt(cut, 1.5), 'red', 'still red at 2.5 s of the source (green only arrives at 3 s)');
  assert.equal(colourAt(cut, 2.5), 'green', 'green by 3.5 s of the source');
});
