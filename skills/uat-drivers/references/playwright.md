# Playwright driver notes

Verified against Playwright **1.59.1** (the version the engine pins, because it matches the browsers cached on the dev machine).

## Spec skeleton

```ts
import { test, expect } from './_uat';

test('UAT-001: Sign in with a valid account', async ({ page, uat }) => {
  await uat.step('s1', 'Open the app', async () => {
    await page.goto(process.env.BASE_URL!);
  }, { holdMs: 1200 });                       // hold longer on screens the viewer must read

  await uat.step('s2', 'Enter credentials', async () => {
    await page.getByLabel('Email').fill(process.env.UAT_USER!);
    await page.getByLabel('Password').fill(process.env.UAT_PASS!);
  });

  await uat.step('s3', 'Log in', async () => {
    await page.getByRole('button', { name: 'Log in' }).click();
  });

  await uat.check('e1', 'Welcome is visible', async () => {
    await expect(page.getByText('Welcome')).toBeVisible();
  });
});
```

## What the fixture does

- Records the page through Chrome's own screencast at 2x pixel density (video → `raw.mp4`, lossless, constant frame rate), turns on `showActions` (click highlights), then starts a trace (`trace.zip`, DOM snapshots without screenshots).
- `uat.step` / `uat.check` record the start time, run your function, wait `holdMs` (default 600 ms steps, 900 ms checks), mark the item passed/failed, and screenshot on failure.
- When a step or check throws, the test stops; later items are reported "not run".

## Gotchas

- Don't start tracing or `page.screencast` yourself: the fixture already records, and trace screenshots slow the recording to about 5 fps.
- Playwright 1.60+ adds richer `showActions` options (cursor, style); the fixture tries them and falls back on 1.59.
- Credential fields: password inputs render as dots, but plain text inputs show typed values in the video. Use dedicated test accounts.
- Flutter **web** renders to canvas; role/text locators will not work. Treat it as a mobile-style problem.
- Cross-origin iframes and native dialogs are not captured by the viewport video.
