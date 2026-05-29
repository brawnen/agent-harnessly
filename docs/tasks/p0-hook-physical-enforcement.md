# P0: Completion-Gate 物理阻断 — 实现路径修正与边界完善

状态：草案 v3
依赖：SPEC §10.3（物理护栏强制）、SPEC §16.3（baseline-diff gate 规则）
被依赖：无（v2 中"被 P1 复用 helper"的设定不再成立，详见 v3 修订说明）

## v3 修订说明

v2 版假设"completion-gate.ts 只 printJson、Claude Code/Codex Stop hook 协议字段缺位、需要在 CLI 层加 `printHookDecision` helper"。**实施第一天 spike 即发现该假设错误**：

- Claude Code 与 Codex 的 hook script 层（由 [`packages/hosts/claude-code/src/index.ts`](packages/hosts/claude-code/src/index.ts) 与 [`packages/hosts/codex/src/index.ts`](packages/hosts/codex/src/index.ts) 的 `renderXxxHookIo` codegen 生成，落盘到 `.harness/hosts/<host>/hooks/`）**已经实现完整的 `decision: 'block'` 协议翻译**
- Claude Code 的 [`renderClaudeCodePreToolUseHook`](packages/hosts/claude-code/src/index.ts#L264) 也已实现 artifact-guard 物理拦截
- 现有架构本质上是 **CLI 业务层 + hook script 协议层** 两层分离（详见 SPEC §10.3 "实现路径"修订段），比 v2 设想的"CLI 加 helper"方案更模块化、更可扩展

v3 范围因此缩窄为**边界完善 + 端到端验证 + 文档修正**：

| v2 项 | v3 处理 |
|---|---|
| `printHookDecision` / `serializeHookOutput` helper | **取消**（不应在 CLI 层耦合宿主协议） |
| completion-gate.ts 三个 block 分支改造 | **取消**（CLI 输出业务字段已正确） |
| Codex 协议 spike + host-dispatch | **取消**（Codex 已支持） |
| 单测扩展 7 个分支 | **取消**（旧 spec 测的是不该有的协议字段） |
| 端到端 dogfood | **保留**（首次真实验证 hook script 在 Claude Code 中真物理生效） |
| blockCount >= 3 人工介入提示 | **保留**（hook script 当前没读 blockCount 字段，加 8 行模板） |

工作量从 2.5 天降至 **0.5–1 天**。

## 1. 背景

SPEC §10.3 要求"角色契约是物理的，不是建议的"。本项目通过**两层分离架构**实现：

| 层 | 文件 | 职责 |
|---|---|---|
| CLI 业务层 | `packages/cli/src/commands/host/completion-gate.ts`、`artifact-guard.ts` | 检测违规、输出业务字段（`pass: false` + reason + 推荐 sub-agent + blockCount） |
| Hook script 协议层 | `.harness/hosts/<host>/hooks/stop.js`、`pre_tool_use.js`（由 `packages/hosts/<host>/src/index.ts` 中 `renderXxxHookIo` codegen 生成） | 把 CLI 业务字段翻译为宿主原生 hook 协议（`{ decision: 'block', reason }` 等） |

v2 spec 误判 hook script 层"缺位"。实际它已存在并工作。本 v3 只补两件事：

1. hook script 的 `buildCompletionDecision` 当前没读 CLI 输出的 `blockCount` 字段。反复阻断时缺少人工介入提示
2. 整个 Stop hook 链路（CLI → hook script → Claude Code）从未端到端验证过真物理生效

## 2. 目标

1. 在 Claude Code 与 Codex 的 hook script `buildCompletionDecision` 中加 blockCount >= 3 时的人工介入提示（追加到 reason 末尾）
2. 端到端 dogfood：在 Claude Code 真实跑 scope_violation 阻断场景，确认主 agent 的"完成"声明真被 Stop hook 物理拦截
3. 在 SPEC §10.3 加"实现路径（参考性）"段落，明示两层分离架构，避免后来者（包括 AI agent）重复 v2 的误判
4. 修正 P0 spec 与 P0-todolist 的过时叙述

## 3. 范围

### 3.1 修改文件

- `packages/hosts/claude-code/src/index.ts`（`renderClaudeCodeHookIo` 中 `buildCompletionDecision` 加 blockEscalation 段）
- `packages/hosts/codex/src/index.ts`（同上）
- `packages/hosts/claude-code/src/index.test.ts`（新增 blockEscalation 测试）
- `packages/hosts/codex/src/index.test.ts`（新增 blockEscalation 测试）
- `docs/spec/v3-core.zh-CN.md`（§10.3 加"实现路径"段）
- `docs/tasks/p0-hook-physical-enforcement.md`（本文件，整体重写为 v3）
- `docs/tasks/p0-todolist.md`（标记 v2 步骤为 superseded，列出 v3 步骤）

### 3.2 不在范围内

- 不改 `packages/cli/src/utils/output.ts`（无需 helper）
- 不改 `packages/cli/src/commands/host/completion-gate.ts`（CLI 输出业务字段已正确）
- 不实现 FYI 注入（同 v2 §6.3）
- 不动 user-prompt-submit 的协议层（待 P1 引入 preset 概念后再评估）

## 4. 实现要点

### 4.1 blockEscalation 段（落点：两个 hook script renderer）

在 `buildCompletionDecision` 函数的 `if (result?.pass === false)` 分支内、`return { decision/status: 'block', reason }` 之前，追加：

```javascript
const blockCount = typeof result.blockCount === 'number' ? result.blockCount : 0;
const blockEscalation = blockCount >= 3
  ? `\n[已被阻断 ${blockCount} 次] 建议人工介入：检查 contract.scope.exclude 是否合理、是否存在工具误判；必要时运行 \`harnessly retry\` 重置任务状态。`
  : '';
```

并把 `${blockEscalation}` 追加到 reason 模板字符串末尾：

```javascript
reason: `Harnessly completion gate 未通过：${result.reason}${stageHint}${agentHint}${evalCommand}${nextStep}${blockEscalation}`
```

阈值 `>= 3`：与 P0 v2 §6.2 一致；不强行硬限制 block 次数（避免误判把合法重试也挡掉）。

### 4.2 测试覆盖

新增两个 host 测试（每个宿主一个）：

- `renderClaudeCodeHookIo` 输出的 `buildCompletionDecision` 字符串包含 `blockEscalation`、`blockCount >= 3`、`harnessly retry`
- `renderCodexHookIo` 同上

不需要写 Node runtime 测试（即 eval 该字符串后跑），因为现有 host 测试就是文本断言风格，保持一致即可。

### 4.3 SPEC §10.3 修订（已完成）

详见 SPEC §10.3 "实现路径（参考性，非规范性）" 段落。两层分离架构落到规范中，让后来者不再误判 hook script 缺位。

## 5. 验证

### 5.1 单元测试

```bash
pnpm test --filter @brawnen/harnessly-host-claude-code
pnpm test --filter @brawnen/harnessly-host-codex
```

新增两个测试用例通过，且 existing tests 不破。

### 5.2 全量

```bash
pnpm typecheck && pnpm test && pnpm build
```

### 5.3 端到端 dogfood（必须人工执行）

**前置**：`pnpm build` 后 `harnessly host install --host claude-code` 重新生成 `.harness/hosts/claude-code/hooks/stop.js`（包含新的 blockEscalation 逻辑）。

**场景 A — Stop hook 物理阻断**：

1. 在 Claude Code 中 `harnessly run "演示 P0 dogfood"` 创建任务
2. 故意修改 `contract.scope.exclude` 命中的文件（如改 `dist/foo.js`）
3. 在主 agent 对话里说"完成了"或"已完成"
4. **期望**：Claude Code 弹出 Stop hook 阻断提示（含 `Harnessly completion gate 未通过：scope_violation` + 推荐 sub-agent + 可执行命令），主 agent 无法直接退出对话

**场景 B — blockEscalation 提示**：

1. 在场景 A 基础上，反复触发 Stop hook 3 次
2. **期望**：第 3 次起的 block reason 包含 `[已被阻断 3 次] 建议人工介入：...`

**场景 C — PreToolUse 写保护（顺手验证现有能力）**：

1. 在 active task 中尝试用 Edit 工具改 `requirement.md`（developer 阶段不应写该文件）
2. **期望**：Claude Code 弹出 PreToolUse 阻断（`Harnessly 写保护：...`），Edit 不生效

三个场景任一失败 → 本 task 不算完成。

## 6. 已知风险

| 风险 | 缓解 |
|---|---|
| Claude Code Stop hook 协议字段名因版本而变 | 当前 `buildCompletionDecision` 写死 `decision: 'block'`，符合主流版本。若未来版本变更，需在 hook script renderer 加版本判断（独立 task） |
| Codex 写的是 `status: 'block'` 而非 `decision: 'block'` | 这是 Codex 协议本身约定（见 `buildCodexHookOutput` 的 if 分支），不是 bug |
| 主 agent 在被 block 后陷入死循环 | blockEscalation 提示已涵盖；第 3 次起明确建议人工介入 |
| dogfood 场景 A 失败的可能原因 | (a) hook script 未重新生成（`harnessly host install` 没跑）；(b) Claude Code 版本协议变化；(c) CLI 输出 `pass: false` 字段被 hook 错误解析。逐一排查 |

## 7. 工作量估算

| 步骤 | 估时 |
|---|---|
| Claude Code + Codex 两个 `buildCompletionDecision` 加 blockEscalation 段 | 0.5 小时 |
| host 测试扩展（两个文件各一条用例） | 0.5 小时 |
| SPEC §10.3 实现路径段（已完成） | — |
| 全量 typecheck + test + build | 0.5 小时 |
| P0 spec v3 + P0-todolist 同步（本文件） | 0.5 小时 |
| 端到端 dogfood 三个场景 | 1 小时（人工） |

**总计：约 3 小时**（AI 部分） + 1 小时（人工 dogfood）

## 8. 验收（commit-gate）

- 两个 host 的 `buildCompletionDecision` 包含 blockEscalation 逻辑
- 两个 host 的 test 新增 blockEscalation 断言用例通过
- 全量 `pnpm typecheck && pnpm test && pnpm build` 通过
- SPEC §10.3 含"实现路径（参考性）"段落
- 端到端 dogfood §5.3 三个场景全部通过

## 9. 后续相关 task

- **P0.1**（条件性，不再必要）：Codex 协议适配 —— **已发现 Codex 协议已实现**，此 task 取消
- **P0.2** Antigravity hook 协议调研 + 适配
- **P0.3**（条件性）按需 FYI 注入 —— 仅在 P1 dogfood 反复观察到主 agent 失忆时启动
- **P1** Workflow Preset 实现（lite / full + `/harness-feat` slash command），SPEC §6.4 —— 与本 P0 完全独立
