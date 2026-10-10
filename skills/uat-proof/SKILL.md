---
name: uat-proof
description: Produce narrated, subtitled UAT/QA proof videos end to end (scenario → test driver → recording → render → review). Use when the user asks for UAT proof, QA evidence videos, a recorded walkthrough of a test, or runs /uat-proof.
argument-hint: "<scenario id | ticket text | path> [--platform web|android|ios|desktop]"
---

# UAT proof videos: orchestrator

You coordinate the pipeline. You do not record, and you never decide pass/fail yourself.

```
UATP="node ${CLAUDE_SKILL_DIR}/../../engine/bin/uatp.ts"
```

Run everything from the **app project's root** (the repo being tested), not from the plugin.

## Hard rules

1. **Pass/fail comes only from `result.json` / the `uatp` exit code** (0 passed, 2 not passed, 1 tool error). Never write "passed" because a video looks fine.
2. Never weaken an assertion, widen a selector, or edit expected text to make a run pass. If a run fails, report it and ask.
3. Stop for **human approval of the storyboard** before recording anything.
4. Test accounts only. Credentials come from env vars and are never written to files, narration or captions.

## Steps

1. **Preflight.** `$UATP doctor`. If `engine/node_modules` is missing, run `npm ci` in `${CLAUDE_SKILL_DIR}/../../engine`. Fix `✗` items before going on; `!` items only matter for the platform in use. In a new app repo run `$UATP init` once.
2. **Scenario.** If the user gave a ticket or story rather than an existing id, delegate to the `uat-scenario-writer` agent (skill `uat-scenario`). Then `$UATP validate <id>` and `$UATP storyboard <id>`.
3. **Approval gate.** Show the user `uat/scenarios/<id>.md` (what they will see and hear). Wait for a yes. Apply edits to the YAML, re-run validate + storyboard.
4. **Drivers.** Delegate to `uat-test-engineer` (skill `uat-drivers`) to write `tests/uat/<id>.spec.ts` and/or `flows/uat/<id>.yaml`.
5. **Record.** `$UATP record <id> -p <platform>` (skill `uat-record`). If it fails because a selector or label is wrong, send the log back to `uat-test-engineer`. If an *assertion* fails against the real app, that is a genuine finding: stop and report.
6. **Render.** `$UATP render <id> -p <platform>` (skill `uat-render`), or delegate to `uat-video-producer`.
7. **Review.** Delegate to `uat-reviewer` (skill `uat-review`) for sync, legibility, secrets, and claim-vs-result checks.
8. **Report** to the user: result per item (from `result.json`), paths to both videos, the VTT/SRT, `report.md`, and any reviewer findings. Say plainly if anything did not pass.

`$UATP all <id> -p <platform>` runs steps 5 and 6 in one go once drivers exist.

## Which agents/skills

| Need | Agent | Skill |
|---|---|---|
| Write/fix scenario | uat-scenario-writer | uat-scenario |
| Write/fix drivers | uat-test-engineer | uat-drivers |
| Record | (you) | uat-record |
| Render/tune | uat-video-producer | uat-render |
| Review output | uat-reviewer | uat-review |
