import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { parse } from 'yaml';
import Ajv from 'ajv';
import { ENGINE_DIR } from './util.ts';
import type { Config } from './config.ts';

export type Platform = 'web' | 'android' | 'ios' | 'desktop';

export type Step = { id: string; do: string; narration: string; caption?: string; sensitive?: boolean };
export type Expectation = { id: string; check: string; narration: string; caption?: string };

export type Scenario = {
  id: string;
  title: string;
  proves: string;
  platforms: Platform[];
  targets?: Record<string, any>;
  preconditions?: string[];
  steps: Step[];
  expect: Expectation[];
  outro: { pass: string; fail: string };
};

const ajv = new Ajv({ allErrors: true, strict: false });
const schema = JSON.parse(readFileSync(join(ENGINE_DIR, 'schemas', 'scenario.schema.json'), 'utf8'));
const validateSchema = ajv.compile(schema);

/** Sentences longer than this are hard to follow when spoken. */
export const MAX_NARRATION_WORDS = 28;

export type Problem = { level: 'error' | 'warn'; message: string };

export function validateScenario(s: unknown): Problem[] {
  const problems: Problem[] = [];
  if (!validateSchema(s)) {
    for (const e of validateSchema.errors ?? []) problems.push({ level: 'error', message: `${e.instancePath || '(root)'} ${e.message}` });
    return problems;
  }
  const sc = s as Scenario;
  const ids = [...sc.steps.map((x) => x.id), ...sc.expect.map((x) => x.id)];
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  for (const d of new Set(dup)) problems.push({ level: 'error', message: `duplicate id ${d}` });
  for (const item of [...sc.steps, ...sc.expect]) {
    const words = item.narration.trim().split(/\s+/).length;
    if (words > MAX_NARRATION_WORDS) problems.push({ level: 'warn', message: `${item.id}: narration is ${words} words; keep it to ~20 so viewers can follow` });
    if (/\$\{|[A-Za-z0-9_]+@[A-Za-z0-9.-]+\.[a-z]{2,}/i.test(item.narration + (item.caption ?? ''))) {
      problems.push({ level: 'error', message: `${item.id}: narration/caption contains a variable or email address; never speak or show credentials` });
    }
  }
  for (const st of sc.steps) {
    if (st.sensitive && /["`\u201c]|(^|\s)'[^']+'(?=[\s.,!?]|$)/.test(st.narration)) problems.push({ level: 'warn', message: `${st.id}: sensitive step narration contains a quoted value; check it is not a secret` });
  }
  for (const p of sc.platforms) {
    if (p === 'desktop' && !sc.targets?.desktop?.command) problems.push({ level: 'error', message: 'platform "desktop" needs targets.desktop.command' });
  }
  return problems;
}

export function substituteEnv(text: string, env = process.env): string {
  return text.replace(/\$\{([A-Z0-9_]+)\}/g, (m, k) => env[k] ?? m);
}

export function loadScenarioFile(file: string): Scenario {
  const raw = parse(readFileSync(file, 'utf8'));
  const problems = validateScenario(raw).filter((p) => p.level === 'error');
  if (problems.length) throw new Error(`${file} is not a valid scenario:\n` + problems.map((p) => `  - ${p.message}`).join('\n'));
  return raw as Scenario;
}

/** Resolve "UAT-001", "UAT-001.yaml" or a path to a scenario file. */
export function resolveScenarioFile(cfg: Config, ref: string): string {
  if (existsSync(ref) && ref.match(/\.ya?ml$/)) return resolve(ref);
  const dir = join(cfg.projectDir, cfg.scenariosDir);
  for (const ext of ['yaml', 'yml']) {
    const f = join(dir, `${basename(ref).replace(/\.ya?ml$/, '')}.${ext}`);
    if (existsSync(f)) return f;
  }
  throw new Error(`No scenario "${ref}" in ${dir}`);
}

export function listScenarioFiles(cfg: Config): string[] {
  const dir = join(cfg.projectDir, cfg.scenariosDir);
  return existsSync(dir) ? readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort().map((f) => join(dir, f)) : [];
}

export function storyboard(sc: Scenario): string {
  const esc = (t: string) => t.replace(/\|/g, '\\|');
  const rows = [
    ...sc.steps.map((s, i) => `| ${i + 1} | ${s.id} | ${esc(s.do)}${s.sensitive ? ' 🔒' : ''} | ${esc(s.caption ?? s.narration)} | ${esc(s.narration)} |`),
    ...sc.expect.map((e) => `| ✓ | ${e.id} | **Check:** ${esc(e.check)} | ${esc(e.caption ?? e.narration)} | ${esc(e.narration)} |`),
  ];
  const words = [...sc.steps, ...sc.expect].reduce((n, x) => n + x.narration.split(/\s+/).length, 0);
  return [
    `# ${sc.id}: ${sc.title}`,
    '',
    `> ${sc.proves}`,
    '',
    `- **Platforms:** ${sc.platforms.join(', ')}`,
    ...(sc.preconditions?.length ? ['- **Before we start:**', ...sc.preconditions.map((p) => `  - ${p}`)] : []),
    `- **Narration:** ${words} words (about ${Math.round(words / 2.6)} seconds spoken)`,
    '',
    '## Storyboard',
    '',
    '| # | ID | What you will see | On-screen caption | What you will hear |',
    '|---|----|-------------------|-------------------|--------------------|',
    ...rows,
    '',
    '## Closing line',
    '',
    `- If everything passes: "${sc.outro.pass}"`,
    `- If anything fails: "${sc.outro.fail}"`,
    '',
    '_Generated by `uatp storyboard` from the scenario YAML. Edit the YAML, not this file._',
    '',
  ].join('\n');
}
