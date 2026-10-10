---
name: uat-drivers
description: Generate or fix the test drivers for a UAT scenario - a Playwright spec for web and a Maestro flow for Android/iOS - so the engine can record and timestamp each step. Use after a scenario is approved, or when a driver fails because of a selector, label or timing problem.
argument-hint: "<scenario id> [--platform web|android|ios]"
---

# Writing and fixing test drivers

```
UATP="node ${CLAUDE_SKILL_DIR}/../../engine/bin/uatp.ts"
```

Input: `uat/scenarios/<ID>.yaml`. Output: `tests/uat/<ID>.spec.ts` (web) and/or `flows/uat/<ID>.yaml` (mobile). Run `$UATP init` first in a new project.

**Every step id and expectation id in the scenario must appear in the driver**, because the engine builds the video timeline and the per-item result from them. An item missing from the driver counts as "not run" and fails the scenario.

## Hard rules

1. One real assertion per `expect` item. Assert what the scenario says, nothing weaker.
2. **Never edit an assertion to make a run pass.** You may fix *how an element is found* (selector, label, wait) when the app is right and the script is wrong. If the app is wrong, leave the assertion and report the failure.
3. Credentials only from env vars (`process.env.UAT_USER`, `${UAT_USER}` in Maestro). Never hardcode, never log.
4. Keep driver text identical in meaning to the scenario so reviewers can map them.

## Web (Playwright)

Details and API notes: [references/playwright.md](references/playwright.md).

- Import from the generated re-export: `import { test, expect } from './_uat';`
- Wrap each scenario step in `uat.step('s1', '<label>', async () => { … })` and each expectation in `uat.check('e1', '<label>', async () => { await expect(...)… })`.
- Prefer `getByRole`, `getByLabel`, `getByText`, `getByTestId`. Read the base URL from `process.env.BASE_URL`.
- Do not start your own screencast or trace; the fixture does it.

## Mobile (Maestro)

Details: [references/maestro.md](references/maestro.md).

- Every command carries a `label` starting with its id: `label: "[s2] Enter email"`. The engine reads these labels to timestamp steps and to decide pass/fail per item.
- Put the label on **every** command belonging to a step, not only the first.
- Find elements by visible text or accessibility id. If the app lacks stable labels, say so and recommend adding `testID` / `accessibilityLabel` (React Native) or `Semantics(label:)` (Flutter) rather than using coordinates.

## Verify

Run once: web `$UATP record <ID> -p web`, mobile `$UATP record <ID> -p android` (needs a device). Read `result.json` in the run folder. Failures in `s*` steps are usually driver problems you can fix; failures in `e*` checks are findings to report.
