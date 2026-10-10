# Scenario fields

Validated by `engine/schemas/scenario.schema.json` (`uatp validate`).

| Field | Required | Notes |
|---|---|---|
| `id` | yes | `UAT-001`. Used for filenames: `tests/uat/<id>.spec.ts`, `flows/uat/<id>.yaml` |
| `title` | yes | 3-90 chars. Title card heading |
| `proves` | yes | One plain sentence. Shown and spoken on the title card |
| `platforms` | yes | Any of `web`, `android`, `ios`, `desktop` |
| `targets.web.baseUrl` | no | May use `${ENV_VAR}`. Exposed to the spec as `BASE_URL` |
| `targets.web.viewport` | no | `{width, height}`, default 1280×720 |
| `targets.android.appId` / `targets.ios.appId` | no | Bundle/package id for the Maestro flow |
| `targets.desktop.command` | for `desktop` | Shell command that drives the app and calls `uatp mark <id>` at each step |
| `preconditions` | no | Listed on the storyboard, not spoken |
| `steps[]` | yes | `id` (`s1`), `do` (what happens, for engineers), `narration`, optional `caption`, optional `sensitive` |
| `expect[]` | yes | `id` (`e1`), `check` (testable statement), `narration`, optional `caption` |
| `outro.pass` / `outro.fail` | yes | Closing line spoken and shown on the end card, chosen from the real result |

Validation errors: schema violations, duplicate ids, `${VAR}` or an email address in narration/caption, `desktop` without a command.
Warnings: narration over 28 words; quoted text in a `sensitive` step's narration.
