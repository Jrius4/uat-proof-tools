import { writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Scenario } from './scenario.ts';
import type { Result } from './timeline.ts';
import type { RenderOutput } from './compose.ts';

/** Human-readable sign-off summary placed next to the videos. */
export function writeReport(dir: string, sc: Scenario, result: Result, outs: Record<string, RenderOutput>): string {
  const rel = (f: string) => relative(dir, f);
  const labels = new Map([...sc.steps.map((s) => [s.id, s.do] as const), ...sc.expect.map((e) => [e.id, `Check: ${e.check}`] as const)]);
  const lines = [
    `# ${sc.id}: ${sc.title}`,
    '',
    `**Result: ${result.passed ? 'PASSED' : 'NOT PASSED'}** · ${result.platform} · ${result.startedAt} · runner: ${result.runner}`,
    '',
    `> ${sc.proves}`,
    '',
    '| Item | What | Result |',
    '|------|------|--------|',
    ...result.items.map((i) => `| ${i.id} | ${labels.get(i.id) ?? ''} | ${i.passed ? '✓ passed' : `✗ ${(i.error ?? 'failed').replace(/\n/g, ' ').replace(/\|/g, '\\|').slice(0, 200)}`} |`),
    '',
    '## Videos',
    '',
    ...Object.entries(outs).map(([p, o]) => `- **${p}**: [${rel(o.video)}](${rel(o.video)}) (${(o.durationMs / 1000).toFixed(0)} s) · subtitles [VTT](${rel(o.vtt)}) / [SRT](${rel(o.srt)})`),
    '',
    ...(result.notes?.length ? ['## Notes', '', ...result.notes.map((n) => `- ${n}`), ''] : []),
    ...Object.values(outs).flatMap((o) => o.warnings).map((w) => `- ⚠ ${w}`),
    '',
    'The pass/fail above comes from the test driver, not from the video or from an AI reviewer.',
    '',
  ];
  const f = join(dir, 'report.md');
  writeFileSync(f, lines.join('\n'));
  return f;
}
