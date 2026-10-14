# Security policy

## Reporting a vulnerability

Please don't open a public issue for security problems. Report them privately through GitHub instead:

1. Go to the [Security tab](https://github.com/Jrius4/uat-proof-tools/security) of this repository.
2. Click **Report a vulnerability** and describe the issue, how to reproduce it, and its impact.

I'll acknowledge the report as soon as I can and keep you updated while it's fixed. Once a fix is released, you're welcome to be credited in the advisory.

## Scope

Things I especially want to hear about:

- Secrets, credentials or personal data leaking into narration, subtitles, reports or rendered videos, including when `sensitive: true` is set
- Commands built from scenario or config values in a way that allows shell or path injection
- Anything that sends recordings or data off the machine without the user asking for it

## Supported versions

Only the latest commit on `main` is supported for now.
