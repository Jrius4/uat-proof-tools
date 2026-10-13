/**
 * Records a page through Chrome's own screencast (CDP `Page.startScreencast`) instead of Playwright's video
 * recorder. Playwright 1.59 encodes to VP8 at 1 Mbit/s in real-time mode with no way to change it, which leaves
 * UI text soft. Here frames arrive as high-quality JPEGs at the page's full pixel density and are written to a
 * lossless, constant-frame-rate H.264 file, so the renderer's single final encode is the only lossy step.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import type { BrowserContext, CDPSession, Page } from '@playwright/test';

/**
 * Turns frames that arrive only when the screen changes into a constant-rate stream. Each frame is held until the
 * next one arrives, so it is written once per 1/fps slot it covered. Frames that land in the same slot replace
 * each other: only the newest is shown.
 */
export class CfrWriter<T> {
  private written = 0;
  private last: T | undefined;
  private fps: number;
  private sink: (frame: T) => void;

  constructor(fps: number, sink: (frame: T) => void) {
    this.fps = fps;
    this.sink = sink;
  }

  get frames() {
    return this.written;
  }

  /** A frame that became visible `ms` after recording started. */
  push(ms: number, frame: T) {
    this.fill(Math.floor((ms * this.fps) / 1000));
    this.last = frame;
  }

  /** Hold the last frame until `ms`, and write it at least once. */
  finish(ms: number) {
    this.fill(Math.max(Math.ceil((ms * this.fps) / 1000), this.written + 1));
  }

  private fill(slot: number) {
    if (this.last === undefined) return;
    while (this.written < slot) {
      this.sink(this.last);
      this.written++;
    }
  }
}

export type Recorder = {
  /** Wall-clock time (Date.now()) of video time 0. */
  startedAt: number;
  stop(): Promise<void>;
};

export async function startRecording(page: Page, context: BrowserContext, file: string, opts: { fps: number; quality: number }): Promise<Recorder> {
  const vp = page.viewportSize() ?? (await page.evaluate(() => ({ width: innerWidth, height: innerHeight })));
  const dpr = await page.evaluate(() => devicePixelRatio);
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  const W = even(vp.width * dpr), H = even(vp.height * dpr);

  const ffmpeg: ChildProcess = spawn('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(opts.fps), '-i', 'pipe:0',
    // A resized window or a frame off by a pixel must not change the output size mid-stream.
    '-vf', `scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '0', '-pix_fmt', 'yuv444p', '-r', String(opts.fps), file,
  ], { stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  ffmpeg.stderr!.on('data', (d) => (stderr += d));
  const exited = new Promise<number | null>((done) => ffmpeg.on('close', done));
  ffmpeg.stdin!.on('error', () => {}); // reported through the exit code below

  // The same Buffer is queued for every repeated slot, so holding a frame costs no extra memory.
  const writer = new CfrWriter<Buffer>(opts.fps, (frame) => ffmpeg.stdin!.write(frame));
  const cdp: CDPSession = await context.newCDPSession(page);
  const startedAt = Date.now();
  cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
    writer.push(Date.now() - startedAt, Buffer.from(data, 'base64'));
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: opts.quality, maxWidth: W, maxHeight: H, everyNthFrame: 1 });

  return {
    startedAt,
    async stop() {
      await cdp.send('Page.stopScreencast').catch(() => {});
      writer.finish(Date.now() - startedAt);
      await cdp.detach().catch(() => {});
      ffmpeg.stdin!.end();
      const code = await exited;
      if (code !== 0) throw new Error(`ffmpeg failed to write ${file} (exit ${code}): ${stderr.trim()}`);
      if (!writer.frames) throw new Error(`No frames were captured for ${file}`);
    },
  };
}
