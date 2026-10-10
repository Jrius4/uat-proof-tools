#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { loadConfig } from '../lib/config.ts';
import type { Config, ProfileName } from '../lib/config.ts';
import { listScenarioFiles, loadScenarioFile, resolveScenarioFile, storyboard, validateScenario } from '../lib/scenario.ts';
import type { Scenario } from '../lib/scenario.ts';
import { ENGINE_DIR, PLUGIN_ROOT, ensureDir, latestRun, log, run, runDir, runId } from '../lib/util.ts';
import { doctor, printDoctor } from '../lib/doctor.ts';
import { appendMark } from '../lib/marks.ts';
import { readResult } from '../lib/timeline.ts';
import { renderProfile } from '../lib/compose.ts';
import type { RenderOutput } from '../lib/compose.ts';
import { writeReport } from '../lib/report.ts';
import { recordWeb } from '../lib/recorders/web.ts';
import { recordAndroid, recordIos } from '../lib/recorders/mobile.ts';
import { recordDesktop } from '../lib/recorders/obs.ts';
import { parse as parseYaml } from 'yaml';
import { readFileSync } from 'node:fs';

const HELP = `uatp: record UAT/QA proof videos with narration and subtitles

  uatp doctor                          check tools and devices
  uatp init                            create uat/, tests/uat/, flows/uat/, uatp.config.yaml here
  uatp validate [id|file ...]          check scenarios (all if none given)
  uatp storyboard <id>                 write <id>.md next to the scenario for human approval
  uatp record <id> -p <platform>       run the driver and record (web|android|ios|desktop)
  uatp render <id> -p <platform>       narrate + subtitle + compose (--profile stakeholder|qa|all)
  uatp all <id> -p <platform>          record then render both profiles
  uatp mark <step-id> [--fail "why"]   (desktop drivers) timestamp the start of a step

Options: -p/--platform, --run <runId>, --profile, --headed, --project <dir> (default: cwd)
`;

type Args = { _: string[]; flags: Record<string, string | boolean> };
function parseArgs(argv: string[]): Args {
  const a: Args = { _: [], flags: {} };
  const short: Record<string, string> = { p: 'platform' };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith('--') || /^-[a-z]$/.test(t)) {
      const key = t.startsWith('--') ? t.slice(2) : short[t.slice(1)] ?? t.slice(1);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) (a.flags[key] = next), i++;
      else a.flags[key] = true;
    } else a._.push(t);
  }
  return a;
}

const PLATFORMS = ['web', 'android', 'ios', 'desktop'] as const;
const RECORDERS = { web: recordWeb, android: recordAndroid, ios: recordIos, desktop: recordDesktop };

function need<T>(v: T | undefined | false, msg: string): T {
  if (!v) throw new Error(msg);
  return v;
}

function platformOf(a: Args, sc: Scenario): (typeof PLATFORMS)[number] {
  const p = a.flags.platform as string | undefined;
  if (!p) {
    if (sc.platforms.length === 1) return sc.platforms[0];
    throw new Error(`Pass --platform (${sc.platforms.join('|')}); ${sc.id} lists several.`);
  }
  if (!(PLATFORMS as readonly string[]).includes(p)) throw new Error(`Unknown platform "${p}"`);
  if (!sc.platforms.includes(p as any)) throw new Error(`${sc.id} does not list platform "${p}" (has: ${sc.platforms.join(', ')})`);
  return p as (typeof PLATFORMS)[number];
}

function gitCommit(dir: string): string | undefined {
  const r = run('git', ['rev-parse', '--short', 'HEAD'], { cwd: dir });
  return r.code === 0 ? r.stdout.trim() : undefined;
}

async function cmdRecord(cfg: Config, sc: Scenario, platform: (typeof PLATFORMS)[number], a: Args): Promise<string> {
  const id = (a.flags.run as string) || runId();
  const dir = ensureDir(runDir(join(cfg.projectDir, cfg.evidenceDir), id, sc.id, platform));
  await RECORDERS[platform]({ cfg, scenario: sc, outDir: dir, headed: !!a.flags.headed });
  const r = readResult(dir);
  log(`${sc.id} ${platform}: ${r.passed ? 'PASSED' : 'NOT PASSED'} → ${relative(process.cwd(), dir)}`);
  for (const i of r.items.filter((x) => !x.passed)) log(`  ✗ ${i.id}: ${i.error ?? 'failed'}`);
  return dir;
}

async function cmdRender(cfg: Config, sc: Scenario, platform: string, a: Args, dirOverride?: string): Promise<boolean> {
  const evidence = join(cfg.projectDir, cfg.evidenceDir);
  const id = (a.flags.run as string) || latestRun(evidence, sc.id, platform);
  const dir = dirOverride ?? runDir(evidence, need(id, `No recorded run for ${sc.id}/${platform}. Run "uatp record" first.`), sc.id, platform);
  const which = (a.flags.profile as string) ?? 'all';
  const names = (which === 'all' ? ['stakeholder', 'qa'] : [which]) as ProfileName[];
  for (const n of names) if (!cfg.profiles[n]) throw new Error(`Unknown profile "${n}"`);
  const outs: Record<string, RenderOutput> = {};
  for (const n of names) outs[n] = await renderProfile({ cfg, scenario: sc, dir, profileName: n, platform, meta: { commit: gitCommit(cfg.projectDir) } });
  const result = readResult(dir);
  const report = writeReport(dir, sc, result, outs);
  log(`report: ${relative(process.cwd(), report)}`);
  return result.passed;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const [cmd, ...rest] = a._;
  if (!cmd || cmd === 'help' || a.flags.help) return void console.log(HELP);
  const cfg = loadConfig((a.flags.project as string) ?? process.cwd());

  switch (cmd) {
    case 'doctor': {
      const { checks, ok } = await doctor(cfg);
      printDoctor(checks);
      process.exit(ok ? 0 : 1);
    }
    case 'init': {
      for (const d of [cfg.scenariosDir, cfg.testsDir, cfg.flowsDir]) ensureDir(join(cfg.projectDir, d));
      const re = join(cfg.projectDir, cfg.testsDir, '_uat.ts');
      // Machine-local re-export so specs get one copy of @playwright/test (the engine's).
      writeFileSync(re, `// Generated by \`uatp init\`. Points at this machine's uatp install; re-run init if the plugin moves.\nexport * from '${join(ENGINE_DIR, 'playwright', 'uat-fixture.ts')}';\n`);
      const cf = join(cfg.projectDir, 'uatp.config.yaml');
      if (!existsSync(cf)) copyFileSync(join(PLUGIN_ROOT, 'config', 'uatp.config.example.yaml'), cf);
      console.log(`Initialised ${cfg.projectDir}\n  scenarios: ${cfg.scenariosDir}\n  specs:     ${cfg.testsDir} (import { test, expect } from './_uat')\n  flows:     ${cfg.flowsDir}\n  config:    uatp.config.yaml`);
      return;
    }
    case 'validate': {
      const files = rest.length ? rest.map((r) => resolveScenarioFile(cfg, r)) : listScenarioFiles(cfg);
      if (!files.length) throw new Error(`No scenarios found in ${cfg.scenariosDir}`);
      let bad = 0;
      for (const f of files) {
        const probs = validateScenario(parseYaml(readFileSync(f, 'utf8')));
        const errs = probs.filter((p) => p.level === 'error');
        console.log(`${errs.length ? '✗' : '✓'} ${relative(process.cwd(), f)}`);
        for (const p of probs) console.log(`    ${p.level === 'error' ? 'error' : 'warn '} ${p.message}`);
        bad += errs.length;
      }
      process.exit(bad ? 1 : 0);
    }
    case 'storyboard': {
      const f = resolveScenarioFile(cfg, need(rest[0], 'Usage: uatp storyboard <id>'));
      const out = f.replace(/\.ya?ml$/, '.md');
      writeFileSync(out, storyboard(loadScenarioFile(f)));
      console.log(`wrote ${relative(process.cwd(), out)}`);
      return;
    }
    case 'record': {
      const sc = loadScenarioFile(resolveScenarioFile(cfg, need(rest[0], 'Usage: uatp record <id> -p <platform>')));
      const dir = await cmdRecord(cfg, sc, platformOf(a, sc), a);
      process.exit(readResult(dir).passed ? 0 : 2);
    }
    case 'render': {
      const sc = loadScenarioFile(resolveScenarioFile(cfg, need(rest[0], 'Usage: uatp render <id> -p <platform>')));
      await cmdRender(cfg, sc, platformOf(a, sc), a);
      return;
    }
    case 'all': {
      const sc = loadScenarioFile(resolveScenarioFile(cfg, need(rest[0], 'Usage: uatp all <id> -p <platform>')));
      const platform = platformOf(a, sc);
      const dir = await cmdRecord(cfg, sc, platform, a);
      const passed = await cmdRender(cfg, sc, platform, a, dir);
      process.exit(passed ? 0 : 2);
    }
    case 'mark': {
      const file = need(process.env.UATP_MARKS_FILE, '`uatp mark` only works inside a desktop driver started by `uatp record`');
      const id = need(rest[0], 'Usage: uatp mark <step-id> [--fail "reason"]');
      const fail = a.flags.fail;
      appendMark(file, { id, epochMs: Date.now(), ...(fail ? { status: 'fail' as const, error: typeof fail === 'string' ? fail : 'failed' } : {}) });
      return;
    }
    default:
      console.error(`Unknown command "${cmd}"\n\n${HELP}`);
      process.exit(64);
  }
}

main().catch((e) => {
  console.error(`uatp: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
