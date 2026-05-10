# Harnessly Service Specification (v3-core)

Status: Draft v1 (language-agnostic)

Purpose: Define an in-task harness layer that constrains how a coding agent does each piece of work — through SPEC, contract, multi-role workflow, scope-check, baseline-diff, structure rules, resident review agents, and a feedback-promotion loop.

Provenance: This specification grew out of v2 (delivery-control layer) and v3 (Agent engineering ops system). v3-core is the long-term-non-replaceable subset of v3, augmented with three layers absorbed from OpenAI Ryan Lopopolo's harness practice (structure rules, resident review agents, feedback promotion). It is designed to compose cleanly under [openai/symphony](https://github.com/openai/symphony) — Symphony schedules work across tasks, Harnessly governs work inside each task.

## Normative Language

The key words `MUST`, `MUST NOT`, `REQUIRED`, `SHOULD`, `SHOULD NOT`, `RECOMMENDED`, `MAY`, and `OPTIONAL` in this document are to be interpreted as described in RFC 2119.

`Implementation-defined` means the behavior is part of the implementation contract, but this specification does not prescribe one universal policy. Implementations MUST document the selected behavior.

## 1. Problem Statement

A coding agent given a single goal (e.g. "fix the login bug") tends to:

- Conflate requirement, design, and implementation in one pass.
- Self-report success without independent verification.
- Drift outside the intended scope (refactor unrelated files while fixing).
- Forget repository-wide conventions and re-invent existing helpers.
- Repeat the same mistake on the next similar task because feedback never gets codified.

Harnessly v3-core solves these by:

- Making each task pass through a fixed multi-stage workflow with role separation.
- Producing a structured artifact chain that survives across sessions and reviewers.
- Enforcing scope (per-task) and structure (per-repo) as physical guardrails.
- Running resident review agents alongside the task workflow.
- Promoting recurring findings into lint rules, tests, or review prompts so the harness gets stricter over time.

## 2. Goals and Non-Goals

### 2.1 Goals

- Provide a six-stage in-task workflow (SPEC → Design → Execute → Review → Test → Commit Gate) driven by an in-repo workflow definition.
- Enforce role separation through native host sub-agents with per-role tool whitelists.
- Capture two evidence snapshots per task (baseline before, current after) and gate on the diff.
- Provide repo-level invariants via `structure-rules.yaml` independent of any single task's scope.
- Run resident review agents at host-defined trigger points (push, merge) orthogonal to the task workflow.
- Pool review findings and provide a tool to promote recurring findings into permanent guardrails.
- Define artifact schemas precise enough that any conforming implementation produces interoperable workflows.
- Be cross-host: any host that supports native sub-agents and lifecycle hooks can be a target.

### 2.2 Non-Goals

- Cross-task scheduling, daemonization, or issue-tracker polling. (Composes with Symphony for that.)
- Web UI or multi-tenant control plane.
- A general-purpose workflow engine. The default workflow is fixed at six stages.
- Memory or knowledge-base autonomy. The repo holds truth; per-conversation memory MUST NOT be authoritative.
- Auto-orchestrating non-host agents over arbitrary protocols.

## 3. System Overview

### 3.1 Main Components

1. **SPEC Loader**
   - Reads the in-repo workflow contract (`.harness/WORKFLOW.md` or split files).
   - Parses YAML front matter + role contracts + skill definitions.
   - Returns a typed `WorkflowConfig`.

2. **Task Manager**
   - Allocates `task_id` and per-task workspace under `.harness/tasks/<task_id>/`.
   - Persists artifacts and state.
   - Recovers task state from filesystem after restart (no DB).

3. **PM Router**
   - Owned by the host's main agent — not a separate sub-agent.
   - Decides next stage based on stage outputs and gate decisions.
   - Spawns role sub-agents through the host's native sub-agent mechanism.
   - Records routing decisions in `state.json`.

4. **Role Sub-agents** (5)
   - `requirement`, `designer`, `developer`, `reviewer`, `tester`.
   - Instantiated as native host sub-agents with role-specific tool whitelists.
   - Communicate only through artifacts on disk; never directly with each other.

5. **Evidence Collector**
   - Captures baseline snapshot before Execute.
   - Captures current snapshot after Execute.
   - Computes baseline-diff: only newly-introduced failures or warnings count.
   - Runs Level-1 (build/lint/typecheck/test via Skills), Level-2 (contract-driven), Level-3 (LLM-assisted, optional).

6. **Skill Runner**
   - Loads `.harness/skills/<check>/<lang>.yaml`.
   - Detects `env_required` binaries.
   - Runs the configured command and applies success / fix-hint templates.

7. **Scope Checker**
   - Reads `contract.yaml` `scope.exclude` (deny-list).
   - Compares against changed files (git diff vs baseline).
   - Hard-blocks on any match.

8. **Structure Checker**
   - Reads `.harness/structure-rules.yaml`.
   - Scans the working tree for repo-wide invariant violations.
   - Hard-blocks on any violation, with `fix_hint`.

9. **Resident Review Agents**
   - Independent of the task workflow.
   - Triggered by host lifecycle events (`pre_push`, `pre_merge`).
   - Aggregate findings into `resident-review.md` for the active task and into `feedback-pool/` for promotion.

10. **Feedback Promoter**
    - Scans `.harness/feedback-pool/*.jsonl`.
    - Counts recurrence of each finding.
    - Promotes findings exceeding threshold into `structure-rules.yaml`, failing tests, review-agent prompt deltas, or skill `fix_hint` enrichment.

11. **Host Adapter**
    - Maps abstract operations (spawn sub-agent, register hook, capture exit) to host-native primitives.
    - REQUIRED targets: at least one host with native sub-agents (e.g. Claude Code or Codex).

### 3.2 Abstraction Levels

Symphony-style six-layer mapping, ordered from team-policy down to integration:

1. **Policy Layer** (repo-defined)
   - `WORKFLOW.md` body (master prompt for sub-agents).
   - `structure-rules.yaml`, `review-agents.yaml`, `skills/`.
2. **Configuration Layer** (typed getters)
   - YAML front matter parsing, defaults, env resolution.
3. **Coordination Layer** (PM router)
   - Stage transition rules, rollback paths, sub-agent dispatch.
4. **Execution Layer** (per-stage sub-agent + workspace)
   - Sub-agent lifecycle, artifact write, hook validation.
5. **Integration Layer** (host adapter + Skill executors)
   - Host-specific sub-agent spawning, lifecycle hooks, command execution.
6. **Observability Layer** (events log + status)
   - Structured `events.jsonl`, optional CLI status surface.

### 3.3 External Dependencies

- A host with native sub-agent support and lifecycle hooks (e.g. Claude Code, Codex).
- Local filesystem for `.harness/` persistence.
- Git for diff computation and (OPTIONAL) per-task worktree isolation.
- `which` (or equivalent) for `env_required` binary detection.
- An LLM-callable provider (used by reviewer / resident review agents for non-static checks).

## 4. Core Domain Model

### 4.1 Entities

#### 4.1.1 Task

A single unit of in-task work, isolated under one workspace.

| Field | Type | Required | Description |
|---|---|---|---|
| `task_id` | string | Y | Stable, monotonically issued. Format `YYYYMMDD-HHMMSS-<rand4>`. |
| `goal` | string | Y | The user-facing intent. |
| `created_at` | ISO timestamp | Y | |
| `current_stage` | enum | Y | One of the six stages. |
| `current_owner` | role | Y | Which role currently holds the task. |
| `state` | enum | Y | `active`, `blocked`, `completed`, `aborted`. |
| `last_failure_reason` | string \| null | N | Set when most recent stage failed. |

#### 4.1.2 SPEC (`requirement.md`)

Plain markdown, but MUST include all of:

- `## Goal` — single-sentence intent.
- `## In Scope` — bulleted list, MUST be non-empty.
- `## Out of Scope` — bulleted list, MUST be non-empty.
- `## Affected Modules` — bulleted list, MAY be empty if greenfield.
- `## Acceptance Criteria` — bulleted list, MUST be non-empty.
- `## Risks` — bulleted list, MAY be empty.
- `## Open Questions` — bulleted list, MAY be empty; if non-empty Designer MUST address them in `design.md`.

The `requirement.md` MUST NOT contain hedging words: `建议`, `可以`, `推荐`, `可选`, `suggest`, `recommend`, `optional` (case-insensitive). Validators MUST reject on detection.

#### 4.1.3 Contract (`contract.yaml`)

Structured projection of the SPEC, machine-validatable.

```yaml
version: "2.0"
task_id: <task_id>
goal: <string>
scope:
  include: [<path-glob>, ...]   # expectation list (display only)
  exclude: [<path-glob>, ...]   # deny-list (HARD)
acceptance_criteria:
  - criterion: <string>
    verifiable_by: build | lint | typecheck | test | playwright | api | manual
    test_hint: <string?>
risk_level: low | medium | high
estimated_complexity: simple | medium | complex
required_checks: [build, lint, typecheck, test]   # subset
linked_spec: requirement.md
linked_design: design.md   # filled in after Design stage
asset_promotion:               # OPTIONAL; see §22
  promote: <bool>              # default false
  topic: <slug>                # required iff promote=true; e.g. oauth-integration
  files: [<artifact-name>, ...]  # which task artifacts to promote (e.g. requirement.md, design.md)
  mode: new_topic | append | replace   # default: new_topic if topic absent, else append
created_at: <iso-timestamp>
```

`scope.include` is an expectation list: it MUST NOT be used as an allow-list for write enforcement. `scope.exclude` is a hard deny-list: any changed file matching it MUST cause the Scope Checker to fail.

`asset_promotion` is OPTIONAL. When `promote: true`, the system MUST promote the listed task artifacts into `docs/architecture/<topic>/` after the task reaches `commit_decision: pass`. See §22 for the full mechanism.

#### 4.1.4 Design (`design.md`)

Markdown body, MUST contain:

- A decision section comparing at least two alternatives.
- An interface section describing new symbols / contracts introduced.
- An impact section listing affected files (estimated).
- A `## Feasibility Self-Check` section (REQUIRED) covering: scope clarity, design completeness, task-breakdown fitness, risk control, conflicts with existing architecture.

The design MUST NOT contain forward references like `same as above`, `parallel to X`, `details elsewhere`. Validators MUST reject if any are detected.

#### 4.1.5 Task Breakdown (`task-breakdown.md`)

Ordered list of subtasks with explicit dependencies. Each subtask MUST have:

- A short name.
- A list of dependency subtask IDs (or none).
- An acceptance signal (how do we know this subtask is done).
- A checkbox `[ ]` toggled by Developer as work progresses.

#### 4.1.6 Implementation Notes (`implementation-notes.md`)

Markdown produced by Developer at end of Execute. MUST contain:

- `## Order` — actual order of subtask execution (may differ from breakdown).
- `## Deviations from Design` — every divergence from `design.md` MUST be documented.
- `## Pitfalls` — issues encountered during implementation.
- `## TODOs Introduced` — every new `TODO` / `FIXME` in the diff MUST be itemized here, otherwise Reviewer auto-rejects.
- `## Sub-task Progress` — copy of the breakdown checkbox state.

#### 4.1.7 Review (`review.md`)

Markdown produced by Reviewer. MUST contain:

- `## Decision` — one of `pass`, `block_execute`, `block_design`, `block_spec`, `defer_to_new_task`.
- `## Block Scope` — `minimal` or `full` (only if Decision is a block_*).
- `## Findings` — list of findings, each with stable ID `F-<task_id>-<seq>`, severity (`P0` / `P1` / `P2`), description, file/line reference, fix hint, and `recurrent_pattern` boolean.

#### 4.1.8 Resident Review (`resident-review.md`)

Aggregated findings from resident review agents. Same finding schema as `review.md`, but originates outside the task workflow.

#### 4.1.9 Test Report (`test-report.md`)

MUST contain:

- `## Acceptance Coverage` — for each acceptance criterion in `contract.yaml`, the verifying mechanism and pass/fail.
- `## Baseline-Diff` — table of build/lint/typecheck/test counts before vs after and delta.
- `## Externally-Run Validations` — only present if explicitly requested by an acceptance criterion (e.g. running against a real downstream repo).

#### 4.1.10 Report (`report.json`)

Machine-readable summary. Schema:

```yaml
task_id: <string>
goal: <string>
final_stage: spec | design | execute | review | test | commit_gate
commit_decision: pass | needs_human_review | fail
artifacts:
  requirement: <path>
  contract: <path>
  design: <path>
  task_breakdown: <path>
  implementation_notes: <path>
  review: <path>
  resident_review: <path>
  test_report: <path>
  baseline_evidence: <path>
  current_evidence: <path>
  baseline_diff: <path>
  commit_summary: <path>
metrics:
  llm_calls: <int>
  duration_seconds: <int>
  retries: <int>
created_at: <iso>
finished_at: <iso>
```

`commit_decision: needs_human_review` is REQUIRED as a third state alongside `pass` / `fail`. Implementations MUST allow Reviewer or PM to set this state when changes are non-failing but architecturally consequential (e.g. schema migration, new dependency, license-relevant change).

#### 4.1.11 State (`state.json`)

MUST be derivable from filesystem artifacts; implementations SHOULD treat it as a cache. Schema:

```yaml
task_id: <string>
current_stage: <stage-enum>
current_owner: <role-enum>
status: active | blocked | completed | aborted
created_at: <iso>
updated_at: <iso>
completed_stages: [<stage>, ...]
retry_count: <int>
last_failure_stage: <stage> | null
last_failure_reason: <string> | null
```

#### 4.1.12 Skill

YAML at `.harness/skills/<check>/<lang>.yaml`:

```yaml
name: build | lint | typecheck | test | <custom>
language: <string>          # e.g. node, go, python; not constrained to enum
command: <single-line shell>
success_exit_code: 0
env_required: [<binary>, ...]
detail_on_pass: <string>
detail_on_fail_template: <string>   # MUST support ${stderr} substitution
fix_hint_template: <string>          # printed when failed; SHOULD instruct how to fix
```

Implementations MUST validate every loaded skill against this schema.

#### 4.1.13 Structure Rule Set

YAML at `.harness/structure-rules.yaml`:

```yaml
file_length:
  max: <int>
  exclude: [<glob>, ...]

unique_implementations:
  - pattern: <glob>
    rule: <natural-language>
    fix_hint: <string>

unique_schemas:
  - pattern: <glob>
    detect: <regex>
    rule: <natural-language>
    fix_hint: <string>

package_dependencies:
  forbid:
    - { from: <glob>, to: <glob> }
  fix_hint: <string>

naming_conventions:
  files: kebab-case | snake_case | camelCase
  classes: PascalCase | snake_case
  constants: UPPER_SNAKE_CASE | ...
```

Each rule MUST emit a `fix_hint` when failed.

#### 4.1.14 Resident Review Agent Definition

YAML at `.harness/review-agents.yaml`:

```yaml
review_agents:
  - name: <slug>
    triggers: [pre_push, pre_merge, on_demand]
    model: <model-id>
    prompt: |
      <multi-line prompt>
    blocking_severity: P0   # findings >= this severity block the trigger
```

#### 4.1.15 Finding (Pool Entry)

JSONL line at `.harness/feedback-pool/<date>.jsonl`:

```json
{
  "id": "F-<task_id>-<seq>",
  "kind": "recurrent_pattern",
  "category": "reliability | scalability | security | style | other",
  "summary": "<short>",
  "examples": [{"task": "<task_id>", "file": "<path>", "line": 42}],
  "fix_hint": "<string>",
  "promotable_as": ["lint", "structure_rule", "failed_test", "review_prompt", "skill_fix_hint"]
}
```

#### 4.1.16 Architecture Asset

A topic-scoped collection of design artifacts promoted from one or more tasks. Lives under `docs/architecture/<topic>/` (NOT under `.harness/` — see §22 for rationale).

Per-topic file layout:

```
docs/architecture/<topic>/
├── README.md             # topic overview index, RECOMMENDED
├── requirement.md        # promoted from task(s)
├── design.md             # promoted from task(s)
├── decisions.md          # ADR-style accumulating decisions, OPTIONAL
└── _harness-meta.json    # provenance metadata (REQUIRED)
```

`_harness-meta.json` schema:

```json
{
  "topic": "<slug>",
  "created_at": "<iso>",
  "harness_version": "<spec-version>",
  "source_tasks": [
    {
      "task_id": "<task_id>",
      "goal": "<string>",
      "promoted_files": ["requirement.md", "design.md"],
      "promoted_at": "<iso>",
      "promotion_mode": "new_topic | append | replace"
    }
  ]
}
```

`source_tasks` MUST be append-only — every promotion appends one entry. Implementations MUST NOT delete prior entries (provenance must survive forever).

### 4.2 Stable Identifiers and Normalization Rules

- **Task ID**: `YYYYMMDD-HHMMSS-<rand4>`. MUST be filename-safe and case-insensitive collision-free.
- **Finding ID**: `F-<task_id>-<seq>`. `seq` is a per-task monotonic integer.
- **Stage Enum**: `spec`, `design`, `execute`, `review`, `test`, `commit_gate`.
- **Role Enum**: `pm`, `requirement`, `designer`, `developer`, `reviewer`, `tester`.
- **Decision Enum**: `pass`, `block_execute`, `block_design`, `block_spec`, `defer_to_new_task`, `needs_human_review`.
- **Severity Enum**: `P0`, `P1`, `P2`.

## 5. Repository Layout

A conformant Harnessly repository MUST contain:

```
.harness/                                # MACHINE-CONSUMED workflow artifacts
├── WORKFLOW.md                          # SHOULD: single-file config (alt: split form below)
├── (split form, also acceptable)
├── harness.config.yaml                  # global settings
├── workflow.yaml                        # stage definitions
├── agents/<role>.yaml × 5               # per-role contracts
├── skills/<check>/<lang>.yaml           # skill definitions (e.g. skills/build/go.yaml)
├── structure-rules.yaml                 # repo-wide invariants
├── review-agents.yaml                   # resident review agents
├── feedback-pool/<date>.jsonl           # accumulating findings
├── feedback-history.md                  # promoted findings ledger
├── decisions/<date>-<topic>.md          # product-layer blocker resolutions (§10.5)
├── tasks/<task_id>/
│   ├── requirement.md
│   ├── contract.yaml
│   ├── design.md
│   ├── task-breakdown.md
│   ├── implementation-notes.md
│   ├── review.md
│   ├── resident-review.md
│   ├── test-report.md
│   ├── commit-summary.md
│   ├── report.json
│   ├── state.json
│   └── evidence/
│       ├── baseline.json
│       ├── current.json
│       └── baseline-diff.json
└── events.jsonl                         # append-only structured event log

docs/                                    # HUMAN-CONSUMED documentation
└── architecture/<topic>/                # cross-task architectural assets (see §22)
    ├── README.md                        # topic overview
    ├── requirement.md                   # promoted from task(s)
    ├── design.md                        # promoted from task(s)
    ├── decisions.md                     # ADR-style accumulator, OPTIONAL
    └── _harness-meta.json               # provenance (source tasks, promotion history)
```

Two distinct domains:

- `.harness/` is **machine-consumed**: workflow state, schema-validated artifacts, event log. IDEs typically collapse it. Sub-agents read/write here under tool whitelists.
- `docs/architecture/` is **human-consumed**: long-lived design and requirement documents promoted from tasks, rendered by docs sites, browsed daily by reviewers and new joiners. Sub-agents MUST NOT write here directly; only the `harness archive promote` system command MAY write here.

Implementations MAY add files within these domains but MUST NOT relocate the listed paths or cross the domain boundary (e.g. MUST NOT put architectural assets under `.harness/`).

## 6. Workflow Specification

### 6.1 Six Default Stages

| Stage | Owner | Reads | Writes | Decision Rule |
|---|---|---|---|---|
| `spec` | requirement | (user input) | `requirement.md`, `contract.yaml` | Stop hook validates SPEC schema; advance to `design` on pass. |
| `design` | designer | `requirement.md`, `contract.yaml` | `design.md` (incl. Feasibility Self-Check), `task-breakdown.md` | Stop hook validates schema and self-check section; advance to `execute` on pass. |
| `execute` | developer | spec + design + task-breakdown | code diff, `implementation-notes.md` | Pre-stage hook captures baseline; post-stage hook captures current. Advance to `review`. |
| `review` | reviewer + resident agents (parallel) | spec + design + diff + notes | `review.md`, `resident-review.md` | Reviewer Decision routes: `pass` → `test`; `block_*` → PM routes back per Decision; `defer_to_new_task` → PM creates new task. |
| `test` | tester | `contract.yaml`, diff | `test-report.md`, `evidence/baseline-diff.json` | All acceptance criteria PASS and baseline-diff has no new failures → `commit_gate`. |
| `commit_gate` | pm | all prior artifacts | `commit-summary.md`, `report.json` | Final decision: `pass` / `needs_human_review` / `fail`. |

### 6.2 Stage Transitions and Rollback

PM MUST honor `Decision` from each stage's owner exactly:

- `pass` → advance to next stage in the linear order.
- `block_execute` (from reviewer) → return to `execute`; previous diff REMAINS (Developer modifies in place).
- `block_design` → return to `design`; existing diff is NOT discarded but `design.md` is rewritten; on next `execute` Developer MUST re-do work consistent with new design.
- `block_spec` → return to `spec`; both `design.md` and any diff are invalidated and MUST be rewritten.
- `defer_to_new_task` → PM creates a new task with linked-issue reference; current task closes with `final_stage: review` and `commit_decision: deferred`.
- `needs_human_review` (from reviewer or commit_gate) → PM halts the workflow, writes `commit-summary.md`, returns control to user.

Block scope:

- `minimal` (default): only the listed P0 findings MUST be fixed; diff outside the listed range is frozen.
- `full`: stage redoes from scratch; previous artifacts are archived under `tasks/<task_id>/archive/<stage>-attempt-<n>/`.

### 6.3 PM Routing Rules

PM is the host's **main agent**, not a separate sub-agent. PM MUST:

- Read all stage outputs and `state.json` before deciding next stage.
- Spawn the next role's sub-agent through the host's native mechanism.
- NEVER produce content for any role other than its own (templated artifacts like `commit-summary.md` are allowed because they are pure aggregation, not professional judgment).
- NEVER skip a stage or change role assignments.
- Halt the workflow and surface to user when any role emits `product_layer_blocker` (see §10.3).

## 7. Role Specifications

Each role MUST be implemented as a native host sub-agent with a tool whitelist enforced by the host's permission system (PreToolUse hook or equivalent).

### 7.1 PM (host main agent)

| Property | Value |
|---|---|
| Model | RECOMMENDED: cheap routing-class model (e.g. Haiku). |
| Tools allowed | spawn_subagent, read, bash_readonly, write to `commit-summary.md` and `state.json` |
| Tools forbidden | edit/write to any other artifact, plan_mode |

### 7.2 requirement

| Property | Value |
|---|---|
| Model | mid-tier (e.g. Sonnet). |
| Tools allowed | read, grep, glob, bash_readonly, plan_mode (only when `plan_mode.enabled: true`) |
| Tools forbidden | edit/write to source code |
| Output | `requirement.md` + derived `contract.yaml` |
| Stop-hook check | SPEC schema + no hedging words. |

### 7.3 designer

| Property | Value |
|---|---|
| Model | mid-tier (e.g. Sonnet). |
| Tools allowed | read, grep, glob, bash_readonly, plan_mode (gated identically to requirement) |
| Tools forbidden | edit/write to source code; write to anything other than `design.md` and `task-breakdown.md` |
| Output | `design.md`, `task-breakdown.md` |
| Stop-hook check | Feasibility Self-Check section present + at least 2 alternatives compared + no forward references. |

### 7.4 developer

| Property | Value |
|---|---|
| Model | high-tier (Sonnet or Opus). |
| Tools allowed | read, edit, write, bash, grep, glob |
| Tools forbidden | plan_mode (REQUIRED forbidden; entry into plan_mode contradicts the role's purpose), write to spec/design/contract/task-breakdown, write to repo-level assets unless `design.md` declared the asset |
| Output | code diff, `implementation-notes.md`, optional repo-level assets declared by design |
| Stop-hook checks | scope-check (per `contract.yaml`), structure-check (per `structure-rules.yaml`), `implementation-notes.md` schema, baseline-diff capture. |

Developer MUST update `task-breakdown.md` checkboxes as work progresses. Failure to mark all subtasks complete by Stop time → reviewer auto-rejects.

### 7.5 reviewer

| Property | Value |
|---|---|
| Model | mid-tier (Sonnet). |
| Tools allowed | read, grep, glob, bash_readonly |
| Tools forbidden | edit/write to anything except `review.md` |
| Output | `review.md` with explicit Decision and Block Scope |
| Required behavior | Each finding MUST have stable ID, severity, fix hint, and `recurrent_pattern` flag. Findings flagged `recurrent_pattern` MUST be appended to today's `feedback-pool/<date>.jsonl`. |

### 7.6 tester

| Property | Value |
|---|---|
| Model | mid-tier (Sonnet). |
| Tools allowed | read, bash, edit/write only test files and `test-report.md` |
| Tools forbidden | edit/write to non-test source code |
| Output | `test-report.md`, `evidence/baseline-diff.json` |
| Required behavior | MUST exercise every acceptance criterion in `contract.yaml`. MUST NOT run external/sandbox-out validations unless an acceptance criterion explicitly requests it. |

## 8. Sub-agent Instantiation

The 5 role sub-agents (PM is the host's main agent, not a sub-agent) MUST be instantiated via the host's native sub-agent mechanism. Single-agent role-switching is FORBIDDEN: a conformant implementation MUST guarantee cold-context isolation between roles, otherwise:

- Reviewer cannot perform independent audit (sees designer's reasoning).
- Per-role model tiering is impossible.
- Per-role tool whitelist is impossible.

For Claude Code: `.claude/agents/harness-<role>.md` with `model:` and `tools:` frontmatter.
For Codex: `.codex/agents/harness-<role>.toml` with equivalent fields.
For hosts without native sub-agents: implementations MAY fall back to a "lite" 3-role configuration (requirement / developer / tester collapsed) but MUST surface a warning to the user.

Sub-agents MUST communicate only via on-disk artifacts. Direct sub-agent → sub-agent calls are FORBIDDEN.

## 9. Plan Mode

Plan mode (Claude Code's `/plan` and equivalents) is OPTIONAL and DEFAULT-OFF for all roles.

If a role enables plan mode (only `requirement` and `designer` MAY do so), the implementation MUST enforce all of:

1. The plan body MUST be persisted as a separate artifact (e.g. `requirement-plan.md`).
2. The user MUST review-and-approve the plan line-by-line. Bulk approval MUST NOT be accepted.
3. Until the plan is approved, the sub-agent MUST NOT advance to producing the structured artifact.

Roles `developer`, `reviewer`, `tester`, `pm`, and any non-existent role MUST NEVER enter plan mode regardless of configuration.

Rationale: An unreviewed plan is encoded incorrect instructions. If a team lacks the discipline to review plans, plan mode SHOULD remain disabled.

## 10. Five Collaboration Disciplines

These are normative and MUST be enforced by the host adapter or workflow engine.

### 10.1 Discipline 1: Downstream MUST NOT modify upstream artifacts

- Each artifact has exactly one Owner role.
- Hosts MUST physically prevent (PreToolUse hook) any role from writing an artifact it does not own.
- A downstream role that disagrees with an upstream artifact MUST emit a blocker; PM MUST route back to the upstream owner.

### 10.2 Discipline 2: PM is router, not brain

PM MUST NOT produce professional content (no requirement writing, no design choices, no code). PM MAY perform pure aggregation: fill `commit-summary.md` template, append to `board.md` (if implementation chooses to maintain one), record routing decisions.

### 10.3 Discipline 3: Role contracts are physical, not advisory

Role tool whitelists, artifact ownership, and stop-hook validation MUST be enforced by the host adapter. Prompt-level admonitions are NOT sufficient.

### 10.4 Discipline 4: Reviewer block must be classified

A reviewer's Decision MUST be one of `pass`, `block_execute`, `block_design`, `block_spec`, `defer_to_new_task`, `needs_human_review`. Plain "rejected" is FORBIDDEN — PM has no way to route otherwise.

### 10.5 Discipline 5: Product-layer blocker escalates to user

If any role detects a void in the v3-core spec or workflow definition that requires cross-product judgment (e.g. "this asset is repo-wide; who owns the write?"), the role MUST emit `product_layer_blocker` and halt. PM MUST NOT auto-resolve. Resolution MUST be recorded either in this spec (for omissions) or in `.harness/decisions/<date>-<topic>.md` (for project-specific calls).

## 11. Scope Check

Inputs:
- `contract.yaml` `scope.exclude` (deny-list of globs).
- Changed files (computed via `git diff <baseline-ref> HEAD`).

Algorithm (REQUIRED):

```
for f in changed_files:
    for pattern in scope.exclude:
        if f matches pattern:
            return FAIL(out_of_scope, file=f, pattern=pattern)
return PASS
```

Implementations MUST NOT use `scope.include` as an allow-list. `scope.include` is a display-only expectation list.

## 12. Structure Check

Implementations MUST run structure-check at the end of every Execute stage. Failure MUST block transition to `review`.

Required rule kinds:

- `file_length.max` — fails any file exceeding line count (excluding listed globs).
- `unique_implementations` — fails when two files in `pattern` export functions with identical names.
- `package_dependencies.forbid` — fails when an import in `from`-glob targets a `to`-glob.

OPTIONAL rule kinds: `unique_schemas`, `naming_conventions`.

Each rule failure MUST include the `fix_hint` from the rule definition.

## 13. Skill Specification

### 13.1 Loading

Implementations MUST resolve a skill by `(check, language)` pair, looking up `.harness/skills/<check>/<language>.yaml`.

If the file does not exist: skill is `skipped` (not failed). The check returns status `skipped` with detail `skill not configured`.

### 13.2 Validation

Loaded YAML MUST be parsed and validated against the schema in §4.1.12. Validation failure MUST raise an error and halt the workflow.

### 13.3 Execution

Algorithm:

```
for bin in skill.env_required:
    if not which(bin):
        return EvidenceCheckResult(status=failed, detail=f"missing required binary: {bin}", fix_hint=skill.fix_hint_template)

result = exec(skill.command, cwd=workdir)
if result.exit_code == skill.success_exit_code:
    return EvidenceCheckResult(status=passed, detail=skill.detail_on_pass)
else:
    return EvidenceCheckResult(
        status=failed,
        detail=skill.detail_on_fail_template.replace("${stderr}", result.stderr.strip()),
        fix_hint=skill.fix_hint_template,
    )
```

Skills MUST run in the task's workspace (worktree if implementation supports it, repo root otherwise).

## 14. Resident Review Agents

Resident review agents are independent of the task workflow. Implementations MUST register them at host lifecycle events.

REQUIRED triggers: at minimum `pre_merge`. RECOMMENDED triggers: `pre_push`.

For each trigger event:

1. For each agent whose `triggers` includes the event, spawn the agent with prompt + diff context.
2. Each agent emits findings (same schema as reviewer findings).
3. Findings are aggregated into `tasks/<active-task-id>/resident-review.md`.
4. Findings flagged `recurrent_pattern` are appended to `feedback-pool/<date>.jsonl`.
5. If any P0 finding's `blocking_severity` matches, the trigger event MUST be blocked (e.g. `pre_merge` returns non-zero).

Resident review agents MUST run in parallel with each other and SHOULD NOT block the task workflow's primary path.

## 15. Feedback Promotion

The promotion CLI command MUST:

1. Scan all files under `feedback-pool/`.
2. Group findings by a similarity heuristic (RECOMMENDED: `category` + summary trigram match).
3. Display each group's count and ask user for promotion target:
   - `lint` / `structure_rule` → append to `structure-rules.yaml`.
   - `failed_test` → generate a test file with a single failing assertion and reference to the finding; developer must implement the fix to make it pass.
   - `review_prompt` → append to the matching `review-agents.yaml` agent's prompt.
   - `skill_fix_hint` → enrich the matching skill's `fix_hint_template`.
   - `dismiss` → remove from pool, log to `feedback-history.md` with reason.
4. After promotion, MUST move processed findings out of `feedback-pool/` into `feedback-history.md`.
5. MUST NOT auto-promote without human confirmation per group.

Threshold default: 3 occurrences. Implementations MAY allow `--threshold` override.

## 16. Evidence and Baseline-Diff

### 16.1 Capture Points

Implementations MUST capture two snapshots per task:

- `evidence/baseline.json` — captured before Developer makes any change (after `design` stage, before `execute`).
- `evidence/current.json` — captured after Developer finishes (after `execute` stage, before `review`).

Each snapshot SHOULD record at minimum:

```yaml
captured_at: <iso>
checks:
  - name: build|lint|typecheck|test|<custom>
    status: passed|failed|skipped
    command: <string>
    duration_ms: <int>
    test_count: <int?>            # only for test check
    detail: <string>
lint_warnings_total: <int>
todo_count: <int>
git_dirty_files: <int>
```

### 16.2 Diff Computation

`evidence/baseline-diff.json` is computed by:

```
for check in baseline.checks ∪ current.checks:
    diff[check] = {
      from: baseline[check].status,
      to: current[check].status,
      regression: (baseline.status == passed AND current.status == failed)
    }
diff.lint_warnings_delta = current.lint_warnings_total - baseline.lint_warnings_total
diff.todo_delta = current.todo_count - baseline.todo_count
```

### 16.3 Gate Rules

The Commit Gate MUST fail if:

- Any check has `regression == true`.
- `lint_warnings_delta > 0` and not justified in `implementation-notes.md`.
- `todo_delta > 0` and the new TODOs are not itemized in `implementation-notes.md`'s `## TODOs Introduced` section.

Pre-existing failures (failing in baseline AND current) DO NOT block — they are not introduced by this task. This is the explicit defense against "this is a historical issue" excuses.

## 17. Host Adapter Specification

A host adapter is a translation layer between the v3-core abstract model and a specific host (Claude Code, Codex, Gemini CLI, etc.).

A conformant host adapter MUST:

1. Provide a way to register the 5 role sub-agents.
2. Provide a way to enforce per-role tool whitelist (PreToolUse hook or equivalent).
3. Provide Stop-hook equivalents for artifact validation.
4. Provide lifecycle hook registration for resident review agent triggers.
5. Provide a way for the main agent (acting as PM) to spawn sub-agents.

Hosts that lack native sub-agent support MAY provide a "lite" adapter: a single agent simulating all roles via prompt switches, with a clear warning that role separation is advisory rather than enforced.

## 18. Memory Boundary

Per-conversation memory or host-managed long-term memory MUST NOT be the authoritative source of any artifact, rule, or decision. The repository (`.harness/` plus source code) is the single source of truth.

Per-user preferences (language, shell, output format) MAY use memory for ergonomics, but team-aligned content MUST live in repo:

- Recurring mistakes → promote to `structure-rules.yaml` or failing test.
- Architectural decisions → `.harness/decisions/<date>-<topic>.md`.
- Coding conventions → `structure-rules.yaml` or `review-agents.yaml`.

## 19. Conformance

A conformant Harnessly v3-core implementation MUST:

- Produce all REQUIRED artifacts in §4 with schemas conforming to §4.
- Pass all five collaboration disciplines (§10) via host-enforced (not prompt-level) mechanisms.
- Implement the six-stage workflow (§6) without skipping or reordering.
- Honor `commit_decision` as a tri-state: `pass` / `needs_human_review` / `fail`.
- Refuse to enter plan mode for roles other than `requirement` and `designer`, regardless of config.
- Reject any spec/design containing forbidden hedging or forward-reference language.
- Compute baseline-diff and apply the gate rules in §16.3.

A conformant implementation SHOULD:

- Provide structure-check, resident review agents, and feedback promotion (the v3-core differentiation).
- Support cross-host operation (at least 2 hosts).
- Persist all state in `.harness/` only — no DB, no user-home writes.
- Recover task state from filesystem after restart.

A conformant implementation MAY:

- Provide a CLI fallback for non-host operation (headless mode).
- Provide a Symphony adapter to be schedulable by [openai/symphony](https://github.com/openai/symphony) at the cross-task layer.
- Add custom check kinds, custom resident review agents, custom skill languages.
- Maintain `.harness/dev-map.md` and `.harness/board.md` for project-level orientation (RECOMMENDED only for long-running projects).

## 20. Reference Implementations

This specification is language-agnostic. The reference implementation lives at [agent-harnessly](https://github.com/lijianfeng/agent-harnessly), written in TypeScript with Claude Code and Codex host adapters.

Other implementations are RECOMMENDED to be built by:

- Pointing your favorite coding agent at this SPEC: "Implement Harnessly v3-core according to docs/spec/v3-core.md."
- Using a different language (Python / Go / Rust) and host (e.g. an in-house IDE agent) as appropriate.
- Documenting any `Implementation-defined` decisions explicitly.

Two implementations are sufficient to validate the spec's portability. We invite contributions of additional adapters and reference implementations.

## 21. Composition with Symphony

When deployed alongside [openai/symphony](https://github.com/openai/symphony):

- Symphony schedules and dispatches issues to per-issue isolated workspaces.
- Within each workspace, Harnessly governs the in-task workflow (this spec).
- Symphony's `WORKFLOW.md` (the issue-level workflow) and Harnessly's `WORKFLOW.md` (the in-task contract) are distinct files; implementations MAY co-locate them but MUST NOT confuse them.
- Symphony's `Human Review` handoff state corresponds to Harnessly's `commit_decision: needs_human_review`.

Two-layer composition is RECOMMENDED for teams that have large issue volume; single-layer Harnessly-only is RECOMMENDED for solo developers and small teams.

## 22. Knowledge Asset Promotion

Some tasks produce design or requirement documents that future tasks MUST reference (e.g. an OAuth integration design is consulted by every subsequent OAuth-related task). v3-core treats these as **first-class human-consumed assets** living under `docs/architecture/<topic>/`, not buried in `.harness/tasks/<id>/`.

This mechanism is parallel to §15 Feedback Promotion: §15 promotes recurring review findings into permanent guardrails (lint / test / structure rule); §22 promotes task-produced design artifacts into permanent reference documentation.

### 22.1 Domain Separation

| Domain | Audience | Write authority | Lifetime |
|---|---|---|---|
| `.harness/tasks/<task_id>/` | Sub-agents (machine-consumed) | Stage owner (per role contract) | Task-bounded; archived when task closes |
| `docs/architecture/<topic>/` | Humans (PR reviewers, new joiners, docs sites) | `harness archive promote` system command ONLY | Permanent project asset; survives across tasks |

Cross-domain rule:

- Sub-agents MUST NOT write to `docs/architecture/`. The role tool whitelist MUST exclude this path.
- The `harness archive promote` system command is the sole write path. It is a system action like `harness init` or `harness feedback promote`, not an agent action.
- The `docs/architecture/` location is REQUIRED. Implementations MUST NOT promote assets to `.harness/architecture/` or any other path; doing so violates the human-consumed/machine-consumed separation that motivates this section.

### 22.2 Two Promotion Paths

#### 22.2.1 Declarative (RECOMMENDED)

The `requirement` role (with user input) sets `asset_promotion` in `contract.yaml` during the SPEC stage:

```yaml
asset_promotion:
  promote: true
  topic: oauth-integration
  files: [requirement.md, design.md]
  mode: new_topic           # or: append, replace
```

When `commit_gate` reaches `commit_decision: pass`, PM MUST invoke `harness archive promote <task_id>` automatically. The command:

1. Reads `contract.yaml.asset_promotion`.
2. Resolves target directory: `docs/architecture/<topic>/`.
3. For each file in `files`, copies `.harness/tasks/<task_id>/<file>` to the target directory.
4. Updates `_harness-meta.json` (creates if absent) by appending a new `source_tasks` entry.
5. Records the promotion in `tasks/<task_id>/commit-summary.md` under `## Promoted Assets`.

Promotion MUST NOT occur when `commit_decision` is `needs_human_review`, `fail`, or `deferred`.

#### 22.2.2 Imperative (fallback)

A user MAY invoke promotion manually at any time:

```bash
harness archive promote <task_id> --topic=<slug> --files=design.md,requirement.md [--mode=append]
```

This bypasses `contract.yaml.asset_promotion`. Required for cases where promotion was not declared upfront but later determined valuable.

### 22.3 Promotion Modes

| Mode | Behavior when target topic exists |
|---|---|
| `new_topic` | MUST fail if topic directory already exists. Used for first-time creation. |
| `append` | If a same-named file exists at target, the new file is written as `<base>-vN.md` (next available N starting from 2). `_harness-meta.json` records both. |
| `replace` | Overwrites the target file. Prior versions are moved to `_archive/<iso>/`. RECOMMENDED only for typo fixes; SHOULD NOT be used for design changes. |

### 22.4 README.md Generation

Whenever a topic is created or updated, the system command MUST regenerate `docs/architecture/<topic>/README.md` from a template that includes:

- Topic name and creation date.
- List of constituent files with one-line descriptions.
- Source task summary (linked task IDs and goals from `_harness-meta.json`).
- Last-promoted timestamp.

Users MAY edit `README.md` manually; subsequent regenerations MUST preserve user edits between markers `<!-- harness:auto-start -->` and `<!-- harness:auto-end -->`. Content outside markers is human-owned and never overwritten.

### 22.5 Cross-Task Discovery

For any new task, the prompt assembler used by `requirement` and `designer` roles SHOULD scan `docs/architecture/` and inject the README.md (or full content if topic count is small) of any topic whose name overlaps with the task's `goal` keywords.

This makes prior architectural decisions automatically visible to the next task without manual search. Implementations MAY use simple keyword matching; semantic retrieval is OPTIONAL.

### 22.6 CLI Commands

A conformant implementation MUST provide:

- `harness archive promote <task_id> [--topic=<slug>] [--files=<list>] [--mode=<mode>]`
- `harness archive list` — lists every topic with file count, source task count, last-promoted date.
- `harness archive show <topic>` — prints README.md and lists all files + source tasks of a topic.

A conformant implementation SHOULD provide:

- `harness archive verify` — checks that every topic has a `_harness-meta.json` whose `source_tasks` references existing or archived `task_id`s; reports orphan topics.

### 22.7 Why This Belongs in `docs/`, Not `.harness/`

Three reasons motivate the domain separation:

1. **Discoverability**: Developers, PR reviewers, and new joiners read `docs/` daily; `.harness/` is typically collapsed by IDEs and ignored. Burying architecture decisions in `.harness/architecture/` defeats their purpose.
2. **Tooling compatibility**: Documentation sites (Docusaurus, MkDocs, GitHub Pages) recognize `docs/` by convention. Architectural assets render naturally; assets in `.harness/` require custom configuration.
3. **Lifecycle alignment**: `.harness/` artifacts are sub-agent machine output validated against schemas. `docs/architecture/` content is a long-lived design narrative that humans edit. Mixing them blurs ownership and complicates Stop-hook validation.

### 22.8 Relationship to §10.5 (`.harness/decisions/`)

`.harness/decisions/<date>-<topic>.md` (introduced in §10.5) and `docs/architecture/<topic>/` serve different purposes:

| | Granularity | Lifecycle | Source | Audience |
|---|---|---|---|---|
| `.harness/decisions/` | One discrete decision (a paragraph) | Append-only ledger | Product-layer blocker resolution | Project maintainers debugging the workflow itself |
| `docs/architecture/` | Full design narrative for a topic | Append + edit | Promoted task artifacts | All developers using the codebase |

Both MAY coexist; implementations MUST NOT merge them.

## Appendix A. Glossary

- **Stage**: one of the six fixed pipeline phases.
- **Role**: one of the six logical actors (PM + 5 sub-agent roles).
- **Sub-agent**: a host-native instance executing one role with cold context.
- **Artifact**: a file under `tasks/<task_id>/` produced by a stage.
- **Skill**: a YAML-defined check (build, lint, typecheck, test, custom).
- **Finding**: a structured review issue with stable ID, severity, fix hint.
- **Promotion**: converting a recurring finding into a permanent guardrail (lint, test, structure rule, etc.).
- **Baseline-diff**: the delta between pre-execute and post-execute evidence snapshots.
- **Architecture Asset**: a topic-scoped collection of long-lived design artifacts under `docs/architecture/<topic>/`, promoted from one or more tasks. See §22.
- **Asset Promotion**: the mechanism that copies selected task artifacts (`requirement.md`, `design.md`, etc.) into `docs/architecture/<topic>/`, performed by the `harness archive promote` system command. Distinct from §15 Feedback Promotion (which targets guardrails). See §22.

## Appendix B. Versioning

This specification is `v3-core Draft 1`. Backward-incompatible changes MUST bump the major version. Adding REQUIRED fields to existing schemas MUST bump the minor version.

Past versions and rationale are tracked in `docs/design/agent-harness-product-design-v3.md` (full v3 design including Knowledge Layer) and `docs/design/agent-harness-product-design-v2.md` (predecessor of v3, simpler delivery-control layer).
