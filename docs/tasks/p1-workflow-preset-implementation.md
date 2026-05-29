# P1: Workflow Preset 实现

状态：草案 v1
依赖：SPEC §6.4（Workflow Preset）、SPEC §4.1.11（state.json v2.1）、SPEC §22.2.1（lite 模式下 asset promotion 触发点）
与 P0 关系：**软依赖**。可并行开工；user-prompt-submit 改造部分需要 P0 提供的 `printHookDecision` helper，建议在 P0 该 helper 落地后再合入本 task 的 hook 改造分支。

## 1. 背景

SPEC §6.4 已定义 Workflow Preset 机制：默认 `lite`（spec → execute → test 三阶段），用户通过 `/harness-feat <goal>` 显式启动 `full`（完整六阶段）。本 task 完成代码层落地。

当前实现假设全部任务走六阶段，[user-prompt-submit.ts](packages/cli/src/commands/host/user-prompt-submit.ts) 中 `detectChangeKind` / `detectRisk` / `applyLearnedDecision` 是一套基于关键词的"自动分类器"，与 §6.4.3 "不得通过启发式手段自动升档" 直接冲突，必须删除并替换为显式声明识别。

## 2. 目标

1. `workflow.yaml` 支持 `presets` schema，声明每个 preset 的阶段子集
2. `WorkflowEngine` 按任务绑定的 preset 跑阶段子集，跳过未列出阶段
3. 提供 4 个 slash command（`/harness-feat` / `/harness-upgrade` / `/harness-status`，加上现有 `/harness-eval`），跨 Claude Code 与 Codex 两宿主同步注册
4. 实现 `harness upgrade` CLI 命令（lite → full 切换）
5. `state.json` schema 升至 v2.1，新增 `preset` / `preset_source` / `preset_set_at` 必需字段
6. `events.jsonl` 新增 `task.preset_set` / `task.preset_upgraded` 两类事件
7. 改造 `user-prompt-submit` hook：删除老分类器，加入 marker 识别，输出 preset 决策
8. 验证 `lite` 模式下 §6.4.4 四道物理护栏（baseline-diff / scope-check / structure-check / 跨任务发现）仍正常生效

## 3. 范围

### 3.1 修改文件

- `packages/shared/src/schemas/*`（state.json / workflow.yaml / events schema）
- `packages/core/src/config.ts`（解析 workflow.yaml presets / default_preset）
- `packages/core/src/workflow.ts`（WorkflowEngine 按 preset 跑阶段）
- `packages/core/src/task.ts`（TaskManager.create 接受 preset 参数 + 写入 state.json）
- `packages/core/src/artifact-guard.ts`（必需工件清单按 preset 动态调整）
- `packages/cli/src/commands/host/user-prompt-submit.ts`（**净删除** 老分类器 + 加 marker 识别 + 输出 preset）
- `packages/cli/src/commands/host/install.ts`（commands/ 同步逻辑）
- `packages/cli/src/utils/events.ts`（preset 事件类型）

### 3.2 新建文件

- `packages/cli/src/commands/upgrade.ts`（`harness upgrade` CLI 命令）
- `.harness/hosts/claude-code/commands/harness-feat.md`
- `.harness/hosts/claude-code/commands/harness-upgrade.md`
- `.harness/hosts/claude-code/commands/harness-status.md`
- `.harness/hosts/codex/commands/harness-feat.toml`
- `.harness/hosts/codex/commands/harness-upgrade.toml`
- `.harness/hosts/codex/commands/harness-status.toml`
- 对应单测文件（preset routing / upgrade / marker detection）

### 3.3 净删除（重要）

[user-prompt-submit.ts](packages/cli/src/commands/host/user-prompt-submit.ts) 与 [intake-feedback.ts](packages/cli/src/utils/intake-feedback.ts) 中以下逻辑**必须删除**：

- `detectChangeKind`（lines 71-99）
- `detectRisk`（lines 111-123）
- `applyLearnedDecision`（lines 221-243）
- `loadIntakeFeedback` / `classifyByIntakeFeedback` / `writeLastIntakeDecision` 整套学习式分类机制（与 §6.4.3 "不得启发式升档" 冲突）
- 相关数据文件：`.harness/intake-last.json`、`.harness/intake-feedback.jsonl`（如存在）

净结果应是 user-prompt-submit.ts **代码行数显著减少**（300+ 行 → 约 80 行）。

### 3.4 不在范围内

- 不修改 baseline-diff / scope-check / structure-check / cross-task discovery 任一现有实现（仅验证其在 lite 模式下不被阶段裁剪绕过）
- 不引入 `standard` 等额外 preset（SPEC §6.4.10 "可"，但 MVP 不做）
- 不实现"按文件路径在 execute 阶段警告该升 full"的辅助提示（SPEC §6.4.10 "可"，留作后续 task）
- 不处理 Antigravity 宿主（待该宿主 slash command 协议确认，单独立 task）
- 不动 P0 范围内的 hook 输出协议改造（按软依赖处理）

## 4. 实现要点

### 4.1 workflow.yaml schema

```yaml
# .harness/workflow.yaml
default_preset: lite

presets:
  lite:
    stages: [spec, execute, test]
    optional_sections:
      requirement: [Risks, Open Questions]
      test_report: [Externally-Run Validations]

  full:
    stages: [spec, design, execute, review, test, commit_gate]
    # 默认全段必需，不列 optional_sections
```

shared schema 校验：

- `default_preset` 必须是 `presets` 中存在的 key
- 每个 preset 的 `stages` 必须是 `[spec, design, execute, review, test, commit_gate]` 的有序子集（**保序**，不允许 [test, spec] 这种乱序）
- 解析失败必须暂停工作流（fail-fast，不静默降级）

### 4.2 WorkflowEngine 改造

`WorkflowEngine.run()` 必须：

1. 从 `taskCtx.state.preset` 读取当前任务的 preset
2. 加载对应 `presets[preset].stages` 作为本次跑的阶段序列
3. 按序列推进，未列出的阶段直接跳过（不创建对应 sub-agent，不强制对应产物）
4. lite 模式跑到最后阶段（`test`）PASS 后，**直接终止任务**（status: completed），不进入 `commit_gate`
5. lite 模式下若 `contract.asset_promotion.promote=true`，在 `test` PASS 后立即触发 `harness archive promote`（SPEC §22.2.1 修订）

### 4.3 artifact-guard 改造

[artifact-guard.ts](packages/core/src/artifact-guard.ts) 的必需工件清单必须按 preset 动态调整：

| Preset | 必需工件清单 |
|---|---|
| `lite` | `requirement.md`, `contract.yaml`, `implementation-notes.md`, `test-report.md` |
| `full` | `requirement.md`, `contract.yaml`, `design.md`, `task-breakdown.md`, `implementation-notes.md`, `review.md`, `test-report.md`, `commit-summary.md`, `report.json` |

`lite` 模式下若主 agent 试图写 `design.md` / `review.md` 等阶段外工件，artifact-guard 应**警告但不强制阻断**（理由：阶段外写入不必拦死，可能用户自己想加注释式 markdown）。但 `state.json` / 必需工件的所有权约束（§10.1 下游不得修改上游）仍强制。

### 4.4 slash command 文件

**Claude Code (`.md` + frontmatter)：**

```markdown
# harness-feat.md
---
description: 创建任务并走完整流程（含 design / review）
---
[harness:feat] {{args}}
```

```markdown
# harness-upgrade.md
---
description: 把当前 active task 从 lite 升级为 full 流程
allowed-tools: Bash(harnessly:*)
---
!harnessly upgrade
```

```markdown
# harness-status.md
---
description: 查看当前 active task 状态
allowed-tools: Bash(harnessly:*)
---
!harnessly status
```

**Codex (`.toml` 或宿主原生格式)：** 等价语义，按 Codex 当前版本格式生成。

`harness-feat` 不调 CLI，而是把 marker `[harness:feat]` 注入主 agent 的 prompt，由 user-prompt-submit hook 在下一轮 prompt 处理时识别并设置 preset。**理由：不依赖 bash 权限，与 hook 协议天然衔接**。

`harness-upgrade` / `harness-status` 直接调 CLI，因为它们是单次动作而非任务创建。

### 4.5 `harness upgrade` CLI 命令

新增 `packages/cli/src/commands/upgrade.ts`：

```
harness upgrade [--task-id=<id>]
```

行为：

1. 读 active task（无 `--task-id` 时）或指定任务的 state.json
2. 校验 `state.preset === 'lite'`，否则报错退出（"任务已为 full，不能再升档"）
3. 校验 `state.status === 'active'`，否则报错（"已关闭的任务不能升档"）
4. 更新 state.json：
   - `preset: 'full'`
   - `preset_source: 'upgrade'`
   - `preset_set_at: <iso>`
   - `current_stage: 'design'`
   - `current_owner: 'designer'`
5. 追加 `events.jsonl`：`{ "type": "task.preset_upgraded", "task_id": "...", "from": "lite", "to": "full" }`
6. **保留**既有 `requirement.md` / `contract.yaml` / 代码 diff / `implementation-notes.md`（SPEC §6.4.5）
7. 输出 next-step 提示："已切回 design 阶段，请通过 `/harness-status` 查看下一步"

### 4.6 state.json schema (v2.1)

`packages/shared/src/schemas/state.ts`（或对应位置）必须新增三字段：

```typescript
preset: z.enum(['lite', 'full']),
preset_source: z.enum(['slash_command', 'prompt_marker', 'upgrade']),
preset_set_at: z.string().datetime(),
```

迁移策略：

- 现有 v2.0 state.json 文件（缺少 preset 字段）→ TaskManager.load 时检测缺失 → **默认填充** `preset: 'lite'` / `preset_source: 'slash_command'` / `preset_set_at: <task.created_at>`，并写回磁盘
- 不要求用户手动迁移；不在 SPEC 中要求 v2.0 拒绝加载

### 4.7 events.jsonl 新增事件

```json
{ "type": "task.preset_set",      "task_id": "...", "preset": "lite|full", "source": "slash_command|prompt_marker", "ts": "<iso>" }
{ "type": "task.preset_upgraded", "task_id": "...", "from": "lite", "to": "full", "ts": "<iso>" }
```

事件用于 §6.4.10 中"按 preset 统计 events.jsonl 的工具"的数据基础（本 task 不实现统计工具，仅产生事件）。

### 4.8 user-prompt-submit hook 改造

改造后骨架（参考实现，非最终代码）：

```typescript
function detectPresetMarker(prompt: string): {
  preset: 'lite' | 'full';
  source: 'prompt_marker' | 'default';
} {
  if (/\[harness:feat\]/i.test(prompt)) {
    return { preset: 'full', source: 'prompt_marker' };
  }
  return { preset: 'lite', source: 'default' };
}

function classifyPrompt(prompt: string, hasActiveTask: boolean): IntakeDecision {
  if (!prompt.trim()) return { action: 'chat', reason: 'empty_prompt' };
  if (isHostInternalPrompt(prompt)) return { action: 'chat', reason: 'host_internal_prompt' };
  if (hasActiveTask && !isExplicitNewTask(prompt)) {
    if (isQuestionOnly(prompt)) return { action: 'chat', reason: 'question' };
    return { action: 'resume_task', reason: 'resume_active' };
  }
  if (isQuestionOnly(prompt)) return { action: 'chat', reason: 'question' };
  return { action: 'create_task', reason: 'change_intent' };
}
```

`detectChangeKind` / `detectRisk` / `applyLearnedDecision` / `loadIntakeFeedback` 整套**移除**，对应数据文件（intake-last.json / intake-feedback.jsonl）也清理。

`create_task` 分支调用 `TaskManager.create(prompt, workDir, { preset, presetSource })`，把 preset 信息写进 state.json + 触发 `task.preset_set` 事件。

#### 4.8.0 注入落点：hook script 层（v3 修订）

> **v3 修订说明**：v2 草案曾把 `hookSpecificOutput.additionalContext` 注入实现在 CLI 层（`user-prompt-submit.ts` 直接输出协议字段），并设计 `printHookContext` helper。**经 P0 实施反馈 + SPEC §10.3 "实现路径（参考性）" 修订**，注入落点改为 **hook script 协议层**（`renderClaudeCodeHookIo` / `renderCodexHookIo` 中的 `buildPromptSubmitContext` 函数）。
>
> CLI 层 `user-prompt-submit.ts` 仍只输出业务字段（`action`、`recommendedAgent`、`activeTaskId`、`activeStage`、`preset` 新字段），不知道宿主协议。`buildPromptSubmitContext` 读这些字段后按下表矩阵决定是否注入 + 注入哪段文案。

#### 4.8.1 `hookSpecificOutput` 注入策略（关键决策）

**注入仅在 `full` 任务的 stage 推进点发生，`lite` 任务完全不注入。** 详细矩阵：

| 场景 | task preset | 是否注入 `hookSpecificOutput.additionalContext` |
|---|---|---|
| `chat`（无 active task / 有 active task）| — / lite / full | **不注入** |
| `create_task` → 新建 `lite` 任务 | lite | **不注入**（主 agent 自行承担 spec → execute → test，无 sub-agent 概念）|
| `create_task` → 新建 `full` 任务（由 `[harness:feat]` marker 触发）| full | **注入**"已创建 full 任务 `<id>`，spec 阶段必须 spawn `harness-requirement` sub-agent" |
| `resume_task` → active task 为 lite | lite | **不注入** |
| `resume_task` → active task 为 full，且 prompt 表达推进意图 | full | **注入**"active task `<id>` 在 stage=`<stage>`，推进时必须 spawn `harness-<role>`"，措辞采用条件式 MUST（见下方示例）|
| `delegate_to_planner`（无 active task，准备进入 SPEC）| — | **注入**"用户表达了新需求，进入 SPEC 阶段时必须 spawn `harness-requirement`" |

**lite 模式不注入的核心理由**：lite 任务的逻辑角色（requirement / developer / tester）由主 agent 直接承担，不要求 spawn 独立 sub-agent（SPEC §6.4.4 + §8 修订）。注入"必须 spawn"指令在 lite 模式下毫无意义且增加上下文污染。

**条件式 MUST 示例（full 任务）：**

```text
[Harnessly] Active full task <id>, current stage=<stage>, expected role for next concrete work: harness-<role>.

When the user's prompt expresses intent to advance this task (e.g. "continue", "go ahead", or any concrete change request), you MUST use the Task tool to spawn the `harness-<role>` sub-agent. Do not write task artifacts directly.

If the user is asking a clarifying question, pausing, or chatting, respond conversationally without spawning a sub-agent.
```

**不做 FYI 注入**：第一版不实现"每次 prompt 注入轻量 task 状态"的 FYI 方案。完整理由见 P0 spec §6.3。如 dogfood 反复观察主 agent 失忆，作为 P0.3 拆出。

#### 4.8.2 实现层落点（v3 修订）

按 SPEC §10.3 两层分离原则：

- **CLI 层**（`packages/cli/src/commands/host/user-prompt-submit.ts`）：仅输出业务字段，**新增** `preset: 'lite' | 'full' | null` 字段（null = 无 active task 或 chat）
- **Hook script 协议层**（`packages/hosts/claude-code/src/index.ts` 与 `packages/hosts/codex/src/index.ts` 中的 `renderXxxHookIo`）：在 `buildPromptSubmitContext` 函数模板中按 §4.8.1 矩阵决定注入 —— 读 `result.preset` + `result.action` + `result.activeStage` + `result.recommendedAgent`，按矩阵生成 additionalContext 文案；lite 路径完全返回空字符串

**helper 复用情况修订**：

- ~~P1 新增 `printHookContext` helper~~ —— **取消**（按 §10.3，CLI 不应输出协议字段）
- ~~`serializeHookOutput` 共享工具~~ —— **取消**（P0 v3 已移除该预留）

P0 v3 实施后的 `buildCompletionDecision` 已经是这种两层分离架构的范例，P1 的 `buildPromptSubmitContext` 改造直接套用同样模式。

## 5. 验证

### 5.1 单元测试

#### config 解析

- workflow.yaml `default_preset` 不在 `presets` 中 → 解析失败
- `presets.lite.stages` 含未知阶段名 → 解析失败
- `presets.lite.stages` 顺序乱（如 [test, spec]）→ 解析失败
- 合法配置 → 解析通过，default_preset 正确

#### WorkflowEngine

- preset=lite 的任务跑到 test 阶段 PASS → status=completed，不进入 commit_gate
- preset=lite 任务在 design / review / commit_gate 阶段不创建 sub-agent
- preset=full 任务行为与现有六阶段一致（回归测试）
- preset=lite 且 contract.asset_promotion.promote=true → test PASS 后调用 archive promote

#### state.json 迁移

- 加载缺 preset 字段的 v2.0 state.json → 自动填充 lite，写回磁盘
- 加载已含 preset 字段的 v2.1 state.json → 不修改

#### user-prompt-submit

- prompt 含 `[harness:feat]` 且无 active task → action=create_task, preset=full
- prompt 不含 marker 且无 active task → action=create_task, preset=lite
- prompt 含 `[harness:feat]` 但有 active task → action=resume_task（不影响既有 task 的 preset；要升档须用 /harness-upgrade）
- prompt 为空 → action=chat
- prompt 为 host_internal → action=chat

#### harness upgrade

- 对 lite active task 调用 upgrade → state.preset=full, currentStage=design, 事件追加
- 对 full active task 调用 upgrade → 报错退出
- 对 completed 任务调用 upgrade → 报错退出
- 升档后 requirement.md / contract.yaml / 代码 diff 保留不变

#### lite 模式护栏保留

- lite 任务 execute 阶段后 → baseline-diff 文件正常产出
- lite 任务命中 scope.exclude → scope-check 正常阻断
- lite 任务违反 structure-rules → structure-check 正常阻断
- lite 任务 spec 阶段 → prompt assembler 正常注入 docs/architecture/

### 5.2 端到端 dogfood

在 Claude Code 中真实跑：

1. **lite 默认流程**：用户输入 "修一下 X 函数的 bug" → 不带 marker → 创建 lite 任务 → 走 spec → execute → test → 完成，不出 design.md / review.md
2. **full 显式流程**：用户输入 `/harness-feat 接入 OAuth 2.0` → 创建 full 任务 → 走完整六阶段
3. **升档流程**：lite 任务跑到 execute 中途 → 用户发现"这事比想的大" → 输入 `/harness-upgrade` → 任务切回 design → designer sub-agent 基于既有 requirement.md 补 design.md
4. **护栏验证**：lite 任务故意改 scope.exclude 命中的文件 → completion-gate 仍然阻断（依赖 P0 协议落地）

四个场景任一失败 → 本 task 不算完成。

## 6. 已知风险

| 风险 | 缓解 |
|---|---|
| 删除 intake-feedback 学习机制是破坏性改动，可能有用户依赖 | release notes 必须显式提到；提供数据文件迁移说明（删除 .harness/intake-last.json 等） |
| state.json v2.0 → v2.1 自动迁移可能在并发场景写冲突 | 迁移逻辑加文件锁（与 TaskManager.save 共享锁） |
| WorkflowEngine 在 lite 模式跳过 commit_gate 后，asset promotion 触发点变化可能漏触发 | §4.2 第 5 点必须 + 单测覆盖 |
| 用户在 full 模式 hook 中误输入 `[harness:feat]` marker 不会有副作用，但可能造成认知干扰 | hook 在 active task 存在时**忽略** marker，仅在创建新任务时识别 |
| slash command 在 Claude Code 中需要安装到 `.claude/commands/`，不同版本路径可能变 | install.ts 实现时按当前 Claude Code 版本约定写；不兼容时 fallback 到 `~/.claude/commands/`（注：违反 v3-core "禁止写用户 home"，需评估） |
| `harness-feat.md` 的 marker 注入方式依赖 Claude Code slash command 的 prompt 展开机制；若该机制变化，需要 fallback | 实现前验证当前版本展开行为；不行则改用 `!harnessly intake --preset=full --goal="{{args}}"` 直调 CLI |

## 7. 工作量估算

| 步骤 | 估时 |
|---|---|
| workflow.yaml preset schema + shared 校验 | 0.5 天 |
| WorkflowEngine 按 preset 跑阶段子集 + artifact-guard 动态清单 | 1 天 |
| state.json v2.0 → v2.1 schema + 自动迁移 | 0.5 天 |
| user-prompt-submit 改造（净删除 + marker 识别） | 1 天 |
| `harness upgrade` CLI 命令 + 单测 | 0.5 天 |
| 6 个 slash command 文件（3 命令 × 2 宿主） | 0.5 天 |
| `harness host install` 同步 commands 目录 | 0.5 天 |
| 单测扩展（§5.1 全部分支） | 0.5 天 |
| 端到端 dogfood（§5.2 四个场景） | 1 天 |

**总计：6 天**

注：与 P0 的 3.5 天合计约 **9.5 天**完成 v2.1 完整落地。

## 8. 验收（commit-gate）

- workflow.yaml 支持 presets schema 且 default_preset=lite
- WorkflowEngine 按 preset 跑阶段子集，lite 不跑 design/review/commit_gate
- state.json 含 preset 三字段，v2.0 自动迁移
- events.jsonl 含 task.preset_set / task.preset_upgraded 事件
- 6 个 slash command 文件存在且 `harness host install` 能正确同步
- `harness upgrade` 命令存在且按 §4.5 行为
- user-prompt-submit 中 detectChangeKind / detectRisk / applyLearnedDecision 等老分类器**已删除**
- §5.1 所有单测分支通过
- §5.2 四个端到端场景在 Claude Code 中实测通过
- §6.4.4 四道物理护栏在 lite 模式下验证仍生效（单测 + dogfood 双重确认）

## 9. 后续相关 task

- **P1.1** 按 preset 统计 events.jsonl 的工具：`harness stats preset`（SPEC §6.4.10 "应"）
- **P1.2** execute 阶段按改动半径警告"该升 full"（SPEC §6.4.10 "可"）
- **P1.3** Antigravity slash command 协议调研 + 适配
- **P1.4** 新增 `standard` preset（介于 lite / full 之间，含 spec + design + execute + test + commit_gate，无独立 reviewer）—— 仅在 dogfood 数据显示 lite/full 二档不够时启动
