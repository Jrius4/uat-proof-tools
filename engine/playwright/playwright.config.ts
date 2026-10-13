import { defineConfig } from '@playwright/test';

const out = process.env.UATP_OUT_DIR ?? 'evidence/standalone';
const [w, h] = (process.env.UATP_VIEWPORT ?? '1280x720').split('x').map(Number);

export default defineConfig({
  testDir: process.env.UATP_TEST_DIR ?? 'tests/uat',
  testMatch: /.*\.spec\.ts/,
  workers: 1,
  retries: 0,
  fullyParallel: false,
  timeout: 120_000,
  reporter: [['list']],
  outputDir: `${out}/pw-artifacts`,
  use: {
    headless: process.env.UATP_HEADED !== '1',
    viewport: { width: w, height: h },
    // Render at high pixel density so text stays sharp; the renderer scales down to the output size.
    deviceScaleFactor: Number(process.env.UATP_DSF ?? 2),
    baseURL: process.env.BASE_URL,
  },
});
