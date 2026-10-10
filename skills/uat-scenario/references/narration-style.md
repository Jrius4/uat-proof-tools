# Narration style

Viewers are clients, product owners and testers watching once, often on mute with subtitles. Write for them.

**Do**
- Speak as "we": "We open the app." "We tap Log in."
- Say what the viewer sees and why it matters: "The dashboard shows the welcome message."
- Use the words on screen: if the button says "Log in", say "Log in".
- Keep sentences under ~12 words; keep a step under two sentences.
- State results neutrally and only for what is checked: "The counter now says zero items left."

**Don't**
- Read selectors, ids, URLs, HTTP codes or code.
- Mention credentials, emails or real customer data, even as examples.
- Claim success in a step: the pass/fail result is added by the engine from the real run.
- Use hype ("perfectly", "flawlessly") or filler ("as you can see").
- Describe two actions in one step.

**Pacing**: the engine holds the last frame so speech finishes before the next action. If narration is much longer than the action, shorten the narration rather than relying on freezes.

**Failure wording**: `outro.fail` should send readers to the QA report: "This check did not pass. The QA report lists what went wrong."
