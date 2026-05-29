# Changelog

This document tracks public npm releases for `@brawnen/harnessly`.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow npm prerelease semantics. Install the current alpha channel with:

```bash
npm install -g @brawnen/harnessly@alpha
```

## [0.1.0-alpha.11] - 2026-05-29

### Added

- Added an MIT `LICENSE` file.
- Added `README.zh-CN.md` as the Simplified Chinese README while keeping `README.md` as the English entry.
- Added a package-local `packages/cli/README.md` so the npm package includes README content.

### Changed

- Translated the root README into English and updated it for public open-source usage.
- Updated package metadata with `"license": "MIT"`.
- Updated README version references to `0.1.0-alpha.11`.

### Notes

- The previously published `0.1.0-alpha.10` package has an empty npm README because the package is published from `packages/cli`, and that directory did not include a README at publish time.
- npm package versions are immutable; publishing a new version is required for the README change to appear on npm.

## [0.1.0-alpha.10] - 2026-05-29

### Added

- Published the public npm package `@brawnen/harnessly`; the `alpha` tag pointed to `0.1.0-alpha.10`.
- Added the `harnessly` CLI entry for repo-local initialization, host integration, task status, fallback execution, evidence evaluation, feedback promotion, and archive workflows.
- Added Host-first integration through `harnessly host install / status / sync`, with Claude Code and Codex host shells generated from `.harness/hosts/`.
- Added workflow presets: `lite` by default for small tasks, and `full` through `[harness:feat]` or `harnessly upgrade`.
- Added completion gate, artifact guard, resident review, scope check, Level 1 evidence, and `report.json` flow support.
- Added the repo-local `.harness/` kernel for contract, plan, state, events, review, report, and host manifests.

### Changed

- Simplified the publish strategy to one public package: `@brawnen/harnessly`. Internal workspace packages are bundled into the CLI output through `tsup` and are not published separately.
- Updated README installation guidance to use `@alpha`, because npm `latest` may point to an older alpha version during prerelease work.
- Clarified the product positioning: Harnessly is an engineering delivery control layer on top of coding agents, not a new agent or runtime.

### Known Limitations

- The package is still alpha; APIs, command details, and host integration behavior may change.
- npm `latest` may not equal the newest alpha version unless the dist-tag is explicitly moved.
- Gemini CLI is not part of the mainline path yet.
- License is MIT.

[0.1.0-alpha.11]: https://www.npmjs.com/package/@brawnen/harnessly/v/0.1.0-alpha.11
[0.1.0-alpha.10]: https://www.npmjs.com/package/@brawnen/harnessly/v/0.1.0-alpha.10
