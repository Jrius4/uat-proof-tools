import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ENGINE_DIR, log, run } from '../util.ts';
import { substituteEnv } from '../scenario.ts';
import { finalizeResult, writeJson, resultPath, timelinePath, normalizeMarkers } from '../timeline.ts';
import type { RecordContext } from './types.ts';

export async function recordWeb({ cfg, scenario, outDir, headed }: RecordContext): Promise<void> {
  const testsDir = resolve(cfg.projectDir, cfg.testsDir);
  const spec = join(testsDir, `${scenario.id}.spec.ts`);
  if (!existsSync(spec)) throw new Error(`No Playwright spec at ${spec}. Generate it with the uat-drivers skill.`);

  const web = scenario.targets?.web ?? {};
  const vp = web.viewport ? `${web.viewport.width}x${web.viewport.height}` : '1280x720';
  const env: NodeJS.ProcessEnv = {
    UATP_OUT_DIR: outDir,
    UATP_TEST_DIR: testsDir,
    UATP_SCENARIO_ID: scenario.id,
    UATP_VIEWPORT: vp,
    UATP_HEADED: headed ? '1' : '0',
    UATP_FPS: String(cfg.render.fps),
    UATP_DSF: String(cfg.capture.web.deviceScaleFactor),
    UATP_JPEG_QUALITY: String(cfg.capture.web.jpegQuality),
  };
  if (web.baseUrl && !process.env.BASE_URL) env.BASE_URL = substituteEnv(web.baseUrl);

  log(`web: running ${spec}`);
  const bin = join(ENGINE_DIR, 'node_modules', '.bin', 'playwright');
  const r = run(bin, ['test', '--config', join(ENGINE_DIR, 'playwright', 'playwright.config.ts'), `${scenario.id}.spec`], {
    cwd: cfg.projectDir,
    env,
  });
  writeFileSync(join(outDir, 'driver.log'), r.stdout + '\n' + r.stderr);

  const itemsFile = join(outDir, 'items.json');
  if (!existsSync(timelinePath(outDir)) || !existsSync(itemsFile)) {
    throw new Error(`Playwright produced no timeline (exit ${r.code}). See ${join(outDir, 'driver.log')}`);
  }
  const { startedAt, items } = JSON.parse(readFileSync(itemsFile, 'utf8'));
  const tl = JSON.parse(readFileSync(timelinePath(outDir), 'utf8'));
  writeJson(timelinePath(outDir), { ...tl, markers: normalizeMarkers(tl.markers) });

  const notes: string[] = [];
  // A non-zero exit with every item green means something outside the steps failed (e.g. a stray assertion).
  if (r.code !== 0 && items.every((i: any) => i.passed)) notes.push('Playwright exited non-zero outside any step; treated as failure');
  const result = finalizeResult(scenario, { scenarioId: scenario.id, platform: 'web', runner: 'playwright', startedAt, items, notes });
  if (r.code !== 0) result.passed = false;
  writeJson(resultPath(outDir), result);
}
