# Harnessly

> **An engineering delivery control layer for coding agents.**
> Harnessly is not a new coding agent or runtime. It turns "the model says it is done" into "the system can verify it is done."

[![Status](https://img.shields.io/badge/status-alpha-orange)]()
[![npm package](https://img.shields.io/badge/npm-0.1.0--alpha.11-CB3837)](https://www.npmjs.com/package/@brawnen/harnessly)
[![Node](https://img.shields.io/badge/node-%3E%3D22-339933)]()
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## What Is Harnessly?

Mainstream AI coding tools such as Claude Code, Codex, and Gemini CLI are getting very good at writing code.
Harnessly focuses on a different problem:

> **How do you know an AI coding task is actually complete, instead of merely reported as complete?**

Harnessly wraps existing coding agents with four engineering-control primitives:

| Capability | Purpose |
| --- | --- |
| `Contract` | Define scope, acceptance criteria, and sensitive boundaries before work starts. |
| `Workflow` | Run a fixed delivery path: `Contract -> Plan -> Execute -> Verify -> Commit`. |
| `Gate` | Block key transitions when required evidence or checks are missing. |
| `Evidence` | Persist verifiable artifacts for every completion claim. |

Harnessly does not make the model smarter. It raises the delivery floor from "trust the answer" to "check the evidence."

---

## Problems It Addresses

| Current pain | Harnessly response |
| --- | --- |
| The agent says "done", but the project does not build or pass checks. | Commit Gate + `report.json`; no evidence, no completion. |
| Requirements are conversational and easy to drift from. | SPEC/contract captures scope and acceptance criteria first. |
| Quality varies across people, agents, and sessions. | Repo-local kernel + repeatable workflow. |
| Delivery history is hard to audit. | Each task keeps contract, plan, review, report, and event artifacts. |
| Teams switch between Claude Code and Codex. | The same `.harness/` source of truth can drive multiple host shells. |

---

## Design Principles

- **Host-first**: users keep working inside Claude Code or Codex. Harnessly intervenes inside the host through hooks or command bridges. The CLI is for fallback, debug, CI, and headless usage.
- **Repo-local kernel**: all authoritative state lives under `.harness/` inside the repository. Host folders such as `.claude/` and `.codex/` are generated shells, not source of truth.
- **Evidence-first**: completion is judged by gate state, verification output, and `report.json`, not by agent self-reporting.
- **Low-frequency intervention**: Harnessly targets major lifecycle points such as `SessionStart`, `UserPromptSubmit`, and `Stop`; it does not micromanage every tool call.
- **Deletable control layer**: every mechanism should remain small enough to remove or downgrade as host models improve.

---

## Architecture

```text
                    +------------------------------+
                    |  Host (Claude Code / Codex)  |  <- primary user surface
                    +--------------+---------------+
                                   | hook / command bridge
                    +--------------v---------------+
                    |   .harness/  (source of truth)|
                    |   - contract / plan          |
                    |   - review / report          |
                    |   - agents/                  |
                    |   - hosts/                   |
                    +--------------+---------------+
                                   | generates
                  +--------+-------+--------+----------+
                  v        v                v          v
              .claude/   .codex/        .gemini/   other host shells
```

Repository layout:

```text
agent-harnessly/
├── AGENTS.md                 # product guardrails
├── packages/
│   ├── cli/                  # @brawnen/harnessly CLI package
│   ├── core/                 # workflow / contract / gate / evidence engine
│   ├── hosts/
│   │   ├── shared/           # shared host adapter logic
│   │   ├── claude-code/      # Claude Code integration
│   │   └── codex/            # Codex integration
│   └── shared/               # shared schema and utilities
└── .harness/                 # repo-local kernel
    ├── harness.config.yaml
    ├── agents/
    ├── hosts/
    └── tasks/
```

---

## Workflow

The first stable product path is intentionally fixed:

```text
SPEC -> DESIGN -> EXECUTE -> REVIEW -> TEST -> COMMIT GATE
```

| Stage | Owner | Main artifact | Decision |
| --- | --- | --- | --- |
| SPEC | `requirement` | `contract.yaml` with scope and acceptance criteria | PASS / FAIL |
| DESIGN | `designer` | `plan.json` with steps, dependencies, and risks | PASS / FAIL |
| EXECUTE | primary host agent | code changes + git diff | - |
| REVIEW | `reviewer` | `review.json` with findings and decision | PASS / FAIL |
| TEST | `tester` | evidence section in `report.json` | PASS / FAIL |
| COMMIT | gate | final decision from contract, review, and evidence | allow / block |

The primary host agent performs implementation by default. Role agents are responsibilities and host-native implementation strategies, not a separate multi-agent runtime.

---

## Install

Harnessly is currently in alpha. APIs and host integration details may change.

```bash
npm install -g @brawnen/harnessly@alpha
# or
pnpm add -g @brawnen/harnessly@alpha
```

To pin the current repository version:

```bash
npm install -g @brawnen/harnessly@0.1.0-alpha.11
```

Requirements:

- Node.js >= 22
- Git repository for normal task and diff workflows

---

## Quick Start

Initialize Harnessly inside an existing project:

```bash
cd your-existing-project
harnessly init --host codex
# or: harnessly init --host claude-code,codex
```

Install host shells:

```bash
harnessly host install
harnessly host status
```

Then continue working in your existing Claude Code or Codex workflow. Harnessly uses host hooks or command bridges to create contracts, persist task state, collect evidence, and enforce completion gates.

CLI-only execution is a fallback/debug/CI path:

```bash
harnessly run --dry-run "<goal>"
harnessly run "<goal>"
harnessly status
harnessly list
```

---

## Commands

| Category | Commands |
| --- | --- |
| Project setup | `harnessly init` |
| Host integration | `harnessly host install / status / sync` |
| Host hook entries | `harnessly host session-start / user-prompt-submit / completion-gate / agent-event` |
| Task execution | `harnessly run [--dry-run]` |
| Task management | `harnessly status / list / retry / archive` |
| Preset upgrade | `harnessly upgrade [--task-id <id>]` |
| Feedback and evaluation | `harnessly feedback / eval` |
| Template promotion | `harnessly template promote` |

### Workflow Presets

Harnessly supports two task presets:

- **lite preset**: `spec -> execute -> test`; default for small fixes, documentation changes, and narrow tasks. It does not dispatch sub-agents.
- **full preset**: complete six-stage workflow with role agents. Use it for features, cross-module changes, or architecture-sensitive work.

To request the full preset from a host prompt, prefix the task with:

```text
[harness:feat] Add OAuth 2.0 login
```

To upgrade an active lite task:

```bash
harnessly upgrade
harnessly upgrade --task-id <id>
```

---

## Host Support

| Host | Product path | Integration | Status |
| --- | --- | --- | --- |
| Claude Code | primary target | hook-first | alpha |
| Codex | primary target | command bridge | alpha |
| Gemini CLI | not on mainline yet | planned | experimental |

---

## Current Status

Current package version in this repository: `0.1.0-alpha.11`.

Implemented alpha capabilities:

- `Contract -> Plan -> Execute -> Verify -> Commit Gate` delivery loop
- Level 1 evidence collection with required checks and `report.json`
- Claude Code and Codex host integration
- lite/full workflow presets
- repo-local task state and host manifests under `.harness/`

Known limitations:

- Alpha APIs and command details may change.
- Gemini CLI is not part of the mainline path yet.
- Documentation and examples are still being expanded.
- The process is too heavy for very small one-off edits.

Best fit:

- medium to large engineering changes
- team workflows that need auditability
- projects where "done" must be backed by evidence

---

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

Tech stack:

- TypeScript 5
- Node.js 22
- pnpm monorepo
- Zod
- Vitest
- tsup

Before changing the core architecture, read:

- `AGENTS.md` - product guardrails
- `CLAUDE.md` - local development constraints
- `docs/design/agent-harness-product-design-v3-core.md` - product design
- `docs/spec/v3-core.md` - product specification
- `docs/archive/README.md` - archived design and trial docs
- `CHANGELOG.md` - public release notes

---

## License

MIT. See [LICENSE](LICENSE).
