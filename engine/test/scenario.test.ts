import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'yaml';
import { readFileSync } from 'node:fs';
import { storyboard, validateScenario } from '../lib/scenario.ts';
import type { Scenario } from '../lib/scenario.ts';
import { finalizeResult } from '../lib/timeline.ts';

const base = (): Scenario => parse(readFileSync(new URL('../../examples/todomvc/uat/scenarios/UAT-DEMO-001.yaml', import.meta.url), 'utf8'));
const errors = (s: unknown) => validateScenario(s).filter((p) => p.level === 'error').map((p) => p.message);

test('the shipped example is valid', () => assert.deepEqual(errors(base()), []));

test('missing required fields are errors', () => {
  const s: any = base();
  delete s.outro;
  assert.ok(errors(s).length > 0);
});

test('duplicate step ids are rejected', () => {
  const s = base();
  s.steps[1].id = 's1';
  assert.ok(errors(s).some((m) => /duplicate id s1/.test(m)));
});

test('credentials or emails in narration are rejected', () => {
  const s = base();
  s.steps[0].narration = 'We sign in as jane@example.com now.';
  assert.ok(errors(s).some((m) => /credentials/.test(m)));
  s.steps[0].narration = 'We type ${UAT_PASS} now.';
  assert.ok(errors(s).some((m) => /credentials/.test(m)));
});

test('over-long narration is a warning, not an error', () => {
  const s = base();
  s.steps[0].narration = Array(40).fill('word').join(' ');
  assert.deepEqual(errors(s), []);
  assert.ok(validateScenario(s).some((p) => p.level === 'warn'));
});

test('desktop platform requires a driver command', () => {
  const s = base();
  s.platforms = ['desktop'];
  assert.ok(errors(s).some((m) => /desktop/.test(m)));
});

test('storyboard lists every step and check', () => {
  const md = storyboard(base());
  for (const id of ['s1', 's2', 's3', 'e1', 'e2']) assert.match(md, new RegExp(`\\| ${id} \\|`));
});

test('a check that never ran makes the whole result NOT passed', () => {
  const sc = base();
  const r = finalizeResult(sc, {
    scenarioId: sc.id, platform: 'web', runner: 't', startedAt: 'now',
    items: [{ id: 's1', passed: true }, { id: 's2', passed: true }, { id: 's3', passed: true }, { id: 'e1', passed: true }],
  });
  assert.equal(r.passed, false);
  assert.equal(r.items.find((i) => i.id === 'e2')?.error, 'not run');
});

test('an apostrophe is not mistaken for a quoted secret, but quotes are flagged', () => {
  const s = base();
  s.steps[1].sensitive = true;
  s.steps[1].narration = "We enter the test account's details.";
  assert.ok(!validateScenario(s).some((p) => p.level === 'warn' && /quoted/.test(p.message)));
  s.steps[1].narration = 'We type "hunter2" here.';
  assert.ok(validateScenario(s).some((p) => p.level === 'warn' && /quoted/.test(p.message)));
});
