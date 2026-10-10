import { writeFileSync, copyFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Config, Profile, ProfileName } from './config.ts';
import type { Scenario } from './scenario.ts';
import type { Marker, Result } from './timeline.ts';
import { readResult, readTimeline } from './timeline.ts';
import { ensureDir, ffprobeDuration, ffprobeSize, log, run, runOrThrow } from './util.ts';
import { speak } from './tts/index.ts';
import type { Clip } from './tts/index.ts';
import { cuesFor, toSrt, toVtt } from './subtitles.ts';
import type { Cue } from './subtitles.ts';
import { captionHtml, checkBannerHtml, endCardHtml, openCards, stepBadgeHtml, tapRingHtml, titleCardHtml } from './cards.ts';

export type PlanItem = { id: string; kind: 'step' | 'check'; label: string; caption?: string; narration: string };

export type Segment = {
  item: PlanItem;
  srcStartMs: number;
  srcLenMs: number;
  speed: number;
  /** Extra time the last frame is held so narration can finish. */
  freezeMs: number;
  outDurMs: number;
  passed: boolean;
};

const MIN_SEG_MS = 80;

export function planItems(sc: Scenario): Map<string, PlanItem> {
  const m = new Map<string, PlanItem>();
  for (const s of sc.steps) m.set(s.id, { id: s.id, kind: 'step', label: s.do, caption: s.caption, narration: s.narration });
  for (const e of sc.expect) m.set(e.id, { id: e.id, kind: 'check', label: e.check, caption: e.caption, narration: e.narration });
  return m;
}

/**
 * Turn markers into output segments. Pure function: no I/O, so pacing rules can be unit-tested.
 * Narration never overlaps the next action: if speech is longer than the recorded step, the last frame is held.
 */
export function buildPlan(
  items: Map<string, PlanItem>,
  markers: Marker[],
  videoMs: number,
  narrationMs: Record<string, number>,
  passedById: Record<string, boolean>,
  p: Profile,
): Segment[] {
  const used = markers.filter((m) => items.has(m.id));
  return used.map((m, i) => {
    const item = items.get(m.id)!;
    const end = i + 1 < used.length ? used[i + 1].startMs : videoMs;
    const srcLen = Math.max(MIN_SEG_MS, end - m.startMs);
    const speech = p.narration ? narrationMs[m.id] ?? 0 : 0;
    let need = speech ? p.leadInMs + speech + p.breathingMs : 0;
    if (item.kind === 'check') need = Math.max(need, p.assertionFreezeMs);
    let speed = 1;
    if (p.speedUpIdleOverMs > 0 && p.speedUpFactor > 1 && srcLen > p.speedUpIdleOverMs) {
      speed = Math.max(1, srcLen / Math.max(need, srcLen / p.speedUpFactor));
    }
    const played = srcLen / speed;
    const outDur = Math.max(played, need);
    return { item, srcStartMs: m.startMs, srcLenMs: srcLen, speed, freezeMs: Math.max(0, outDur - played), outDurMs: Math.round(outDur), passed: passedById[m.id] ?? false };
  });
}

const sec = (ms: number) => (ms / 1000).toFixed(3);
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

function ff(args: string[]) {
  runOrThrow('ffmpeg', ['-y', '-loglevel', 'error', '-nostdin', ...args]);
}


/**
 * Re-time the raw recording to a constant frame rate, once per run. Screen recorders such as `simctl` write a
 * frame only when the picture changes, so after seeking to the start of a step the first frame returned is the
 * *next* change and `setpts=PTS-STARTPTS` slides it to t=0, shifting everything earlier by the idle time.
 * Constant-rate frames make seeking exact. The last frame is held out to the container's real duration.
 */
export function constantRate(rawFile: string, outFile: string, durationMs: number, fps: number): string {
  if (existsSync(outFile) && statSync(outFile).mtimeMs >= statSync(rawFile).mtimeMs) return outFile;
  ff(['-i', rawFile, '-an', '-vf', `fps=${fps},tpad=stop_mode=clone:stop_duration=${sec(durationMs)}`, '-t', sec(durationMs), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p', outFile]);
  return outFile;
}

export type RenderOutput = { video: string; vtt: string; srt: string; thumb: string; passed: boolean; durationMs: number; warnings: string[] };

export async function renderProfile(opts: {
  cfg: Config;
  scenario: Scenario;
  dir: string;
  profileName: ProfileName;
  platform: string;
  meta?: { commit?: string; device?: string };
}): Promise<RenderOutput> {
  const { cfg, scenario: sc, dir, profileName, platform } = opts;
  const p = cfg.profiles[profileName];
  const tl = readTimeline(dir);
  const result: Result = readResult(dir);
  const rawFile = join(dir, tl.video);
  const warnings: string[] = [];

  const rawSize = ffprobeSize(rawFile);
  const scale = Math.min(1, cfg.render.maxWidth / rawSize.width);
  const W = even(rawSize.width * scale), H = even(rawSize.height * scale);
  const fps = cfg.render.fps;
  const videoMs = ffprobeDuration(rawFile);

  const work = ensureDir(join(dir, 'render', profileName));
  const source = constantRate(rawFile, join(ensureDir(join(dir, 'render')), 'raw-cfr.mp4'), videoMs, fps);
  const ttsCache = ensureDir(join(dir, 'tts'));
  const items = planItems(sc);
  // Never narrate a failed check as if it had succeeded: replace the scripted line with a plain statement of what was expected.
  for (const it of items.values()) {
    const ran = result.items.find((r) => r.id === it.id);
    if (it.kind === 'check' && ran && !ran.passed) {
      it.narration = `This did not pass. We expected: ${it.label.replace(/\.$/, '')}.`;
      it.caption = `Not met: ${it.caption ?? it.label}`;
    }
  }
  const offset = cfg.syncOffsetMs[platform] ?? 0;
  const markers = tl.markers.map((m) => ({ ...m, startMs: Math.max(0, m.startMs + offset) }));

  // --- narration -----------------------------------------------------------
  const clips: Record<string, Clip> = {};
  if (p.narration) {
    for (const [id, it] of items) if (markers.some((m) => m.id === id)) clips[id] = speak(cfg, it.narration, ttsCache);
  }
  const outroText = result.passed ? sc.outro.pass : sc.outro.fail;
  const titleText = sc.proves;
  const titleClip = p.narration ? speak(cfg, titleText, ttsCache) : null;
  const outroClip = p.narration ? speak(cfg, outroText, ttsCache) : null;

  const passedById = Object.fromEntries(result.items.map((i) => [i.id, i.passed]));
  const narrationMs = Object.fromEntries(Object.entries(clips).map(([k, c]) => [k, c.durationMs]));
  const segs = buildPlan(items, markers, videoMs, narrationMs, passedById, p);
  if (!segs.length) throw new Error('Timeline has no markers matching the scenario; nothing to render.');
  for (const id of items.keys()) if (!markers.some((m) => m.id === id)) warnings.push(`${id} has no timeline marker (not run); shown only on the end card`);

  const titleMs = Math.max(p.titleCardMs, titleClip ? titleClip.durationMs + 900 : 0);
  const endMs = Math.max(p.endCardMs, outroClip ? outroClip.durationMs + 900 : 0);

  // --- overlays --------------------------------------------------------------
  const cards = await openCards(W, H);
  const u = cards.unit;
  const date = new Date().toISOString().slice(0, 10);
  const failed = result.items.filter((i) => !i.passed).map((i) => i.id);
  const cues: Cue[] = [];
  type Overlay = { png: string; fromMs: number; toMs: number };
  const segOverlays: Overlay[][] = [];
  let outStart = titleMs;
  try {
    await cards.render(titleCardHtml(u, p.titleStyle, sc.id, sc.title, sc.proves, { platform, date, ...opts.meta }), join(work, 'title.png'));
    await cards.render(endCardHtml(u, p.endStyle, result.passed, sc.id, outroText, failed), join(work, 'end.png'));

    for (const [i, seg] of segs.entries()) {
      const ov: Overlay[] = [];
      const it = seg.item;
      const lead = p.leadInMs;
      const speech = clips[it.id]?.durationMs ?? 0;
      if (speech) cues.push(...cuesFor(it.narration, outStart + lead, speech));

      if (p.burnSubtitles) {
        // Checks already show their short caption in the top banner, so the bottom subtitle carries the narration instead.
        if (it.caption && it.kind === 'step') {
          const f = join(work, `cap-${i}.png`);
          await cards.render(captionHtml(u, it.caption), f, { transparent: true });
          ov.push({ png: f, fromMs: lead, toMs: seg.outDurMs });
        } else if (speech) {
          for (const [k, c] of cuesFor(it.narration, lead, speech).entries()) {
            const f = join(work, `cap-${i}-${k}.png`);
            await cards.render(captionHtml(u, c.text), f, { transparent: true });
            ov.push({ png: f, fromMs: c.startMs, toMs: c.endMs });
          }
        }
      }
      if (p.stepBadge && it.kind === 'step') {
        const f = join(work, `badge-${i}.png`);
        await cards.render(stepBadgeHtml(u, it.id, it.label), f, { transparent: true });
        ov.push({ png: f, fromMs: 0, toMs: seg.outDurMs });
      }
      // Tap markers: only taps that land inside this segment's recorded span, mapped through any speed-up.
      for (const [k, tap] of (tl.taps ?? []).entries()) {
        const at = tap.atMs + offset + (cfg.tapLagMs[platform] ?? 0);
        if (at < seg.srcStartMs || at >= seg.srcStartMs + seg.srcLenMs) continue;
        const f = join(work, `tap-${i}-${k}.png`);
        await cards.render(tapRingHtml(u, tap.x * (W / rawSize.width), tap.y * (H / rawSize.height)), f, { transparent: true });
        const from = (at - seg.srcStartMs) / seg.speed;
        ov.push({ png: f, fromMs: from, toMs: Math.min(seg.outDurMs, from + cfg.render.tapShowMs) });
      }
      if (it.kind === 'check' || !seg.passed) {
        const text = !seg.passed && it.kind === 'step' ? 'Step did not complete' : p.stepBadge ? `${it.id} ${it.label}` : it.caption ?? it.narration;
        const f = join(work, `check-${i}.png`);
        await cards.render(checkBannerHtml(u, seg.passed, text), f, { transparent: true });
        ov.push({ png: f, fromMs: 0, toMs: seg.outDurMs });
      }
      segOverlays.push(ov);
      outStart += seg.outDurMs;
    }
  } finally {
    await cards.close();
  }
  const totalMs = outStart + endMs;
  if (titleClip) cues.unshift(...cuesFor(titleText, 300, titleClip.durationMs));
  if (outroClip) cues.push(...cuesFor(outroText, outStart + 300, outroClip.durationMs));

  // --- encode pieces ---------------------------------------------------------
  const vEnc = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(cfg.render.crf), '-pix_fmt', 'yuv420p', '-r', String(fps)];
  const aEnc = ['-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '1'];
  const pieces: string[] = [];

  const cardClip = (png: string, ms: number, speech: Clip | null, name: string) => {
    const out = join(work, name);
    const inputs = ['-loop', '1', '-framerate', String(fps), '-t', sec(ms), '-i', png];
    if (speech) {
      ff([...inputs, '-i', speech.file, '-filter_complex', `[1:a]adelay=300:all=1,apad=whole_dur=${sec(ms)}[a]`, '-map', '0:v', '-map', '[a]', ...vEnc, ...aEnc, '-t', sec(ms), out]);
    } else {
      ff([...inputs, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-map', '0:v', '-map', '1:a', ...vEnc, ...aEnc, '-t', sec(ms), out]);
    }
    pieces.push(out);
  };

  cardClip(join(work, 'title.png'), titleMs, titleClip, 'p-title.mp4');

  for (const [i, seg] of segs.entries()) {
    const out = join(work, `p-${String(i).padStart(2, '0')}-${seg.item.id}.mp4`);
    const ovs = segOverlays[i];
    const args = ['-ss', sec(seg.srcStartMs), '-t', sec(seg.srcLenMs), '-i', source];
    ovs.forEach((o) => args.push('-loop', '1', '-framerate', String(fps), '-t', sec(seg.outDurMs), '-i', o.png));
    const clip = clips[seg.item.id];
    if (clip) args.push('-i', clip.file);
    else args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono');
    const aIdx = 1 + ovs.length;

    let chain = `[0:v]setpts=(PTS-STARTPTS)/${seg.speed.toFixed(4)},fps=${fps},scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
      `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,tpad=stop_mode=clone:stop_duration=${sec(seg.freezeMs + 40)}[v0]`;
    let last = 'v0';
    ovs.forEach((o, k) => {
      chain += `;[${last}][${k + 1}:v]overlay=0:0:eof_action=pass:enable='between(t,${sec(o.fromMs)},${sec(o.toMs)})'[v${k + 1}]`;
      last = `v${k + 1}`;
    });
    chain += `;[${last}]format=yuv420p[vout]`;
    chain += clip
      ? `;[${aIdx}:a]adelay=${p.leadInMs}:all=1,apad=whole_dur=${sec(seg.outDurMs)}[aout]`
      : `;[${aIdx}:a]atrim=0:${sec(seg.outDurMs)}[aout]`;
    ff([...args, '-filter_complex', chain, '-map', '[vout]', '-map', '[aout]', ...vEnc, ...aEnc, '-t', sec(seg.outDurMs), out]);
    pieces.push(out);
  }

  cardClip(join(work, 'end.png'), endMs, outroClip, 'p-end.mp4');

  // --- chapters, subtitles, final mux ---------------------------------------
  let t = titleMs;
  const chapters = [`;FFMETADATA1`, `[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=${titleMs}\ntitle=${sc.title}`];
  for (const seg of segs) {
    chapters.push(`[CHAPTER]\nTIMEBASE=1/1000\nSTART=${t}\nEND=${t + seg.outDurMs}\ntitle=${seg.item.id}: ${seg.item.kind === 'check' ? seg.item.label : seg.item.label}`);
    t += seg.outDurMs;
  }
  chapters.push(`[CHAPTER]\nTIMEBASE=1/1000\nSTART=${t}\nEND=${t + endMs}\ntitle=${result.passed ? 'Result: passed' : 'Result: not passed'}`);
  const metaFile = join(work, 'chapters.ffmeta');
  writeFileSync(metaFile, chapters.join('\n') + '\n');

  const base = `${sc.id}.${platform}.${profileName}`;
  const vtt = join(dir, `${base}.vtt`), srt = join(dir, `${base}.srt`);
  writeFileSync(vtt, toVtt(cues));
  writeFileSync(srt, toSrt(cues));

  const listFile = join(work, 'concat.txt');
  writeFileSync(listFile, pieces.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n') + '\n');

  const video = join(dir, `${base}.mp4`);
  const subArgs = p.softSubtitles && cues.length ? ['-i', srt, '-map', '2:0', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng'] : [];
  ff([
    '-f', 'concat', '-safe', '0', '-i', listFile,
    '-i', metaFile,
    ...(subArgs.length ? [subArgs[0], subArgs[1]] : []),
    '-map', '0:v', '-map', '0:a', ...(subArgs.length ? subArgs.slice(2) : []),
    '-map_metadata', '1', '-map_chapters', '1',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000', '-ar', '48000',
    '-metadata', `title=${sc.id}: ${sc.title}`,
    '-movflags', '+faststart', video,
  ]);

  const thumb = join(dir, `${base}.jpg`);
  const thumbAt = (titleMs + segs[0].outDurMs / 2) / 1000;
  const th = run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(thumbAt), '-i', video, '-frames:v', '1', '-q:v', '3', thumb]);
  if (th.code !== 0) copyFileSync(join(work, 'title.png'), thumb.replace(/\.jpg$/, '.png'));

  const durationMs = ffprobeDuration(video);
  if (Math.abs(durationMs - totalMs) > 400) warnings.push(`output is ${durationMs} ms but plan was ${totalMs} ms; check subtitle sync`);
  log(`${profileName}: ${video} (${(durationMs / 1000).toFixed(1)}s, ${result.passed ? 'PASSED' : 'NOT PASSED'})`);
  return { video, vtt, srt, thumb, passed: result.passed, durationMs, warnings };
}
