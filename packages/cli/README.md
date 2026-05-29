# Harnessly

Harnessly is an engineering delivery control layer for coding agents.

Languages: English | [简体中文](https://github.com/brawnen/agent-harnessly/blob/main/README.zh-CN.md)

It is not a new coding agent or runtime. It adds repo-local contracts, workflow, gates, and evidence around existing tools such as Claude Code and Codex, so a task is judged by verifiable artifacts instead of agent self-reporting.

## Install

```bash
npm install -g @brawnen/harnessly@alpha
```

To pin the current alpha release:

```bash
npm install -g @brawnen/harnessly@0.1.0-alpha.11
```

Requires Node.js >= 22.

## Quick Start

```bash
cd your-existing-project
harnessly init --host codex
harnessly host install
harnessly host status
```

After host installation, keep working in your existing coding-agent host. The CLI is mainly the fallback, debug, CI, and host command bridge surface.

## Main Commands

```bash
harnessly init --host claude-code,codex
harnessly host install
harnessly host status
harnessly host sync
harnessly status
harnessly list
harnessly run --dry-run "<goal>"
harnessly eval [task-id]
harnessly upgrade [--task-id <task-id>]
harnessly template promote
```

## Status

Current package version: `0.1.0-alpha.11`.

The package is still in alpha. APIs, command details, and host integration behavior may change.

## Links

- npm: https://www.npmjs.com/package/@brawnen/harnessly
- Changelog: https://github.com/brawnen/agent-harnessly/blob/main/CHANGELOG.md
- Repository README: https://github.com/brawnen/agent-harnessly#readme

## License

MIT.
