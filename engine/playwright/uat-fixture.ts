/**
 * Playwright fixture that turns an ordinary spec into a recorded, timestamped UAT run.
 *
 *   import { test, expect } from './_uat';          // re-export created by `uatp init`
 *   test('UAT-001', async ({ page, uat }) => {
 *     await uat.step('s1', 'Open the app', async () => { await page.goto(process.env.BASE_URL!); });
 *     await uat.check('e1', 'Welcome is visible', async () => { await expect(page.getByText('Welcome')).toBeVisible(); });
 *   });
 *
 * Writes raw.webm, timeline.json, result.json (and trace.zip) into $UATP_OUT_DIR.
 */
import { test as base, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export { expect };

type Item = { id: string; passed: boolean; error?: string };

export type Uat = {
  /** An action the viewer should follow. Pauses afterwards so the outcome is visible. */
  step(id: string, label: string, fn: () => Promise<unknown>, opts?: { holdMs?: number }): Promise<void>;
  /** An expectation. Put real `expect()` assertions inside; failure marks the run as not passed. */
  check(id: string, label: string, fn: () => Promise<unknown>, opts?: { holdMs?: number }): Promise<void>;
};

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(ANSI, '').split('\n').filter(Boolean).slice(0, 6).join(' | ');

export const test = base.extend<{ uat: Uat }>({
  uat: async ({ page, context }, use, testInfo) => {
    const scenarioId = process.env.UATP_SCENARIO_ID ?? testInfo.title.split(/[:\s]/)[0];
    const outDir = resolve(process.env.UATP_OUT_DIR ?? join('evidence', 'standalone', scenarioId, 'web'));
    mkdirSync(outDir, { recursive: true });

    const size = page.viewportSize() ?? { width: 1280, height: 720 };
    await page.setViewportSize(size);
    await page.screencast.start({ path: join(outDir, 'raw.webm'), size });
    // Order matters: tracing screenshots started before the screencast shrink the video to an 800x450 corner.
    await context.tracing.start({ screenshots: true, snapshots: true });
    // Click/typing highlights. Newer Playwright (1.60+) supports a styled cursor; 1.59 only the basic form.
    const screencast = page.screencast as any;
    try {
      await screencast.showActions({
        position: 'top-right',
        duration: 900,
        cursor: 'pointer',
        style: {
          point: 'width: 26px; height: 26px; border-radius: 50%; background: rgba(255, 196, 0, .55); border: 3px solid #ff9f00',
          highlight: 'outline: 3px solid #ff9f00; background: rgba(255, 196, 0, .14)',
          title: 'display: none',
        },
      });
    } catch {
      await screencast.showActions({ position: 'top-right', duration: 900, fontSize: 22 });
    }
    const t0 = Date.now();
    const startedAt = new Date().toISOString();
    const markers: { id: string; startMs: number }[] = [];
    const items: Item[] = [];

    const exec = (kind: 'step' | 'check') => async (id: string, label: string, fn: () => Promise<unknown>, opts: { holdMs?: number } = {}) => {
      markers.push({ id, startMs: Date.now() - t0 });
      try {
        await fn();
        items.push({ id, passed: true });
      } catch (e) {
        items.push({ id, passed: false, error: `${label}: ${msg(e)}` });
        await page.screenshot({ path: join(outDir, `${id}-failure.png`) }).catch(() => {});
        throw e;
      } finally {
        await page.waitForTimeout(opts.holdMs ?? (kind === 'check' ? 900 : 600));
      }
    };

    await use({ step: exec('step'), check: exec('check') });

    // Reached only after the test body finished or threw; hold the last frame, then finalize.
    await page.waitForTimeout(1200);
    await page.screencast.stop();
    await context.tracing.stop({ path: join(outDir, 'trace.zip') });
    writeFileSync(join(outDir, 'timeline.json'), JSON.stringify({ scenarioId, platform: 'web', video: 'raw.webm', markers }, null, 2));
    // Provisional; `uatp record` completes it against the scenario and the runner's exit status.
    writeFileSync(join(outDir, 'items.json'), JSON.stringify({ startedAt, items }, null, 2));
  },
});
