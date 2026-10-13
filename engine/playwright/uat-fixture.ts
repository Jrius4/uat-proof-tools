/**
 * Playwright fixture that turns an ordinary spec into a recorded, timestamped UAT run.
 *
 *   import { test, expect } from './_uat';          // re-export created by `uatp init`
 *   test('UAT-001', async ({ page, uat }) => {
 *     await uat.step('s1', 'Open the app', async () => { await page.goto(process.env.BASE_URL!); });
 *     await uat.check('e1', 'Welcome is visible', async () => { await expect(page.getByText('Welcome')).toBeVisible(); });
 *   });
 *
 * Writes raw.mp4, timeline.json, result.json (and trace.zip) into $UATP_OUT_DIR.
 */
import { test as playwrightTest, expect, type Browser, type BrowserContext } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { startRecording } from './cdp-recorder.ts';

export { expect };

/**
 * UAT_CDP_URL (e.g. http://127.0.0.1:9222) attaches the run to a Chrome that is already running with
 * --remote-debugging-port. The default context is that Chrome's own profile, so its sign-in is used and
 * no storage file is needed. That context is never closed: closing it would close the person's windows.
 * Without UAT_CDP_URL, Playwright launches its own browser as usual.
 */
const base: typeof playwrightTest = process.env.UAT_CDP_URL
  ? playwrightTest.extend<{}, { browser: Browser }>({
      browser: [
        async ({ playwright }, use) => {
          // Never closed by us: closing a CDP-connected browser would close the attached Chrome's windows.
          const browser = await playwright.chromium.connectOverCDP(process.env.UAT_CDP_URL!);
          await use(browser);
        },
        { scope: 'worker' },
      ],
      context: async ({ browser }, use) => {
        const context: BrowserContext = browser.contexts()[0] ?? (await browser.newContext());
        await use(context);
      },
    })
  : playwrightTest;

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
    const fps = Number(process.env.UATP_FPS ?? 30);
    const recorder = await startRecording(page, context, join(outDir, 'raw.mp4'), { fps, quality: Number(process.env.UATP_JPEG_QUALITY ?? 100) });
    // No trace screenshots: the video already shows every frame, and trace screenshots throttle the screencast to ~5 fps.
    await context.tracing.start({ screenshots: false, snapshots: true });
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
    // Markers are measured from the first video frame.
    const t0 = recorder.startedAt;
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
    await recorder.stop();
    await context.tracing.stop({ path: join(outDir, 'trace.zip') });
    writeFileSync(join(outDir, 'timeline.json'), JSON.stringify({ scenarioId, platform: 'web', video: 'raw.mp4', cfr: true, fps, markers }, null, 2));
    // Provisional; `uatp record` completes it against the scenario and the runner's exit status.
    writeFileSync(join(outDir, 'items.json'), JSON.stringify({ startedAt, items }, null, 2));
  },
});
