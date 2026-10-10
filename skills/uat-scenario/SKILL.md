---
name: uat-scenario
description: Write or edit a UAT scenario YAML (steps, narration, captions, expectations) and its storyboard from a ticket, user story, or plain description. Use when creating or revising the source file that proof videos are generated from.
argument-hint: "<ticket text | story | scenario id>"
---

# Writing UAT scenarios

The scenario YAML is the **single source of truth**. Test drivers, narration, subtitles and the storyboard are all generated from it, so write it for a non-technical viewer first.

```
UATP="node ${CLAUDE_SKILL_DIR}/../../engine/bin/uatp.ts"
```

Files live in `uat/scenarios/<ID>.yaml` in the app project. Field reference: [references/schema.md](references/schema.md). Voice and wording rules: [references/narration-style.md](references/narration-style.md). Worked examples: [examples/](examples/).

## Process

1. Read the source (ticket, story, acceptance criteria). List what a viewer must *see* to believe the feature works.
2. Split into **steps** (things a person does: `s1`, `s2`…) and **expect** items (things that must be true: `e1`, `e2`…). Each `expect` becomes a real assertion in the driver, so it must be checkable from what is on screen (text, element visible, URL).
3. Do **not invent expected results**. If the source does not say what happens, ask the user or mark it as a question in your reply; never guess an expected message.
4. Write `narration` for every step and expectation, plus `proves` (one sentence for the title card) and `outro.pass` / `outro.fail`.
5. `$UATP validate <ID>`, fix errors, read warnings. Then `$UATP storyboard <ID>` and show the user the generated `.md`.

## Rules that matter

- One idea per step. Prefer 4 to 8 steps; split longer journeys into several scenarios.
- Narration is spoken aloud and shown as subtitles: ≤ ~20 words, present tense, plain words, no selectors, no ids, no jargon.
- **Never put credentials, emails, tokens or real names in narration or captions.** Mark steps that type secrets with `sensitive: true` and narrate them generically ("We enter the test account's details").
- `caption` is optional short on-screen text (≤ 80 chars) for steps; for expectations it appears in the green banner. Leave it out to show the narration instead.
- `outro.fail` must not claim anything succeeded. The engine never speaks `outro.pass` unless the run actually passed.
- IDs: steps `s1…`, expectations `e1…`, scenario ids like `UAT-001`.
- List only the platforms you will really record.
