# Contributing to uat-proof

Thanks for helping. Bug reports, ideas, docs fixes, new examples and code are all welcome.

## Ways to help

- **Report a bug or ask for a feature** with the [issue templates](https://github.com/Jrius4/uat-proof-tools/issues/new/choose). Include `uatp doctor` output for bugs.
- **Pick up an issue.** Comment on it first so two people don't build the same thing.
- **Add an example** under `examples/` for an app type or platform that isn't covered yet.
- **Improve a skill or agent** in `skills/` or `agents/` if Claude writes scenarios or drivers that need fixing too often.
- **Port something to another OS.** The engine is macOS-first today. Linux and Windows support for recording and narration (Piper already runs there) is a good place to start.

## How changes reach `main`

`main` is protected. Nobody pushes to it directly, and every change goes through a pull request that:

1. passes the `test` check (CI), and
2. is approved by the maintainer ([@Jrius4](https://github.com/Jrius4), the code owner).

You don't need write access to contribute. Fork the repo, work on a branch in your fork, and open a pull request against `main`.

```bash
git clone https://github.com/<you>/uat-proof-tools.git
cd uat-proof-tools
git checkout -b fix/short-description
```

Keep each pull request to one change. A small, focused PR gets reviewed much faster than a large one.

## Development setup

Requirements are in the [README](README.md#quick-start): Node ≥ 22.6 and ffmpeg with libx264 are enough to run the tests. Platform tools (Maestro, adb/scrcpy, Xcode, OBS) are only needed for the platform you're working on.

```bash
npm ci --prefix engine
npm test --prefix engine
```

To see the whole pipeline end to end, run the web demo:

```bash
cd examples/todomvc
node ../../engine/bin/uatp.ts all UAT-DEMO-001 -p web
```

To try your changes as a Claude Code plugin in another project, run `claude --plugin-dir /path/to/your/uat-proof-tools`.

## Guidelines

- **The engine stays deterministic.** PASS/FAIL comes from the test driver's real result, never from Claude or from how a video looks. Don't add steps that make a model call during `record` or `render`.
- **Add or update tests** in `engine/test/` for engine changes. They use the built-in `node:test` runner, with no build step.
- **No secrets or client data.** Never commit credentials, tokens, real customer data, or recordings. `evidence/` is ignored for a reason, so don't force-add it.
- **Update the docs** (README, `docs/`, the relevant `SKILL.md`) when commands, config keys or behaviour change.
- **Commit messages:** a short imperative summary line, e.g. "Attach web runs to a running Chrome with UAT_CDP_URL".

## Security

Please report vulnerabilities privately. See [SECURITY.md](SECURITY.md).

## Code of conduct

By taking part you agree to follow the [code of conduct](CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
