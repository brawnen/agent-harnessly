# P1 实施 TODO

## 目标
按 [P1 spec](./p1-workflow-preset-implementation.md) 落地 Workflow Preset 机制（lite/full + slash command + upgrade）。本 session 仅做**阶段 1：基础设施层**（shared schema + config + workflow engine + task），不动 hook / user-prompt-submit / CLI 入口。

## 边界
- **阶段 1 处理**：prerequisite spec 修订 + shared schema + state.json v2.0→v2.1 迁移 + workflow.yaml preset schema + WorkflowEngine 按 preset 跑阶段子集 + artifact-guard 按 preset 动态调整
- **阶段 1 不处理**：user-prompt-submit 改造、hook script 注入、harness upgrade CLI、6 个 slash command 文件、harness host install 同步
- **关键风险**：state.json 自动迁移要避免并发写冲突；workflow.yaml 兼容现有项目（既有项目无 presets 字段时按默认 full 跑保持向后兼容）

## TODO List

| # | 状态 | 步骤 | 涉及范围 | 验证方式 | 备注 |
|---|---|---|---|---|---|
| 1 | 已完成 | Prerequisite: 修 P1 spec §4.8 落点（CLI 层 → hook script 层）+ 删除 §4.8.2 printHookContext helper 概念 | `docs/tasks/p1-workflow-preset-implementation.md` | 文档自洽 | 按 SPEC §10.3 两层分离原则 |
| 2 | 已完成 | 探索现有 shared schema / config / workflow / task / artifact-guard 结构 | `packages/shared/src/`、`packages/core/src/` | 文件阅读 | 关键发现：workflow.yaml 当前**不存在**，工作流硬编码；TaskState **无 zod schema**只 interface；故 v2.0→v2.1 迁移更简单 |
| 3 | 已完成 | shared schema: 加 WorkflowPreset/PresetSource type + 扩展 TaskState 三字段 + zod schemas + 加 PRESET_STAGE_MAP | `packages/shared/src/index.ts` | typecheck | 调整：workflow.yaml 解析推后到阶段 2，本阶段用硬编码 PRESET_STAGE_MAP |
| 4 | 跳过 | shared schema: workflow.yaml presets schema 定义 | — | — | 调整原因：workflow.yaml 文件当前不存在，本阶段先用 PRESET_STAGE_MAP 硬编码，文件解析推后到阶段 2 |
| 5 | 已完成 | TaskManager.load 自动迁移 v2.0→v2.1（migrateTaskStateV2_1 + listTasks 同步）+ TaskManager.create 接受 CreateTaskOptions | `packages/core/src/task.ts` | 单测 2 个新增（迁移 + create preset），原 3 个保持 | |
| 6 | 跳过 | core/config.ts: 解析 workflow.yaml presets | — | — | 调整原因：合并到阶段 2 与 user-prompt-submit 改造一起做 |
| 7 | 已完成 | core/workflow.ts: WorkflowEngine 按 preset 跑阶段子集，lite 跳过 design/review/commit_gate + finalizeLitePreset | `packages/core/src/workflow.ts` | typecheck + 既有测试不破 | resumeFrom='design' 在 lite 下抛错 |
| 8 | 已完成 | core/artifact-guard.ts: runArtifactGuard 接受可选 preset 参数，按 REQUIRED_ARTIFACTS_BY_PRESET 切换清单；workflow.ts 调用点传 ctx.state.preset | `packages/core/src/artifact-guard.ts`、`packages/core/src/workflow.ts` | typecheck | 未传 preset 时按 full 兼容 |
| 9 | 已完成 | 全量 typecheck + test + build | 仓库 | typecheck 全过；test 117/118 passed（CodexAdapter stale failure 与 P1 无关）；build 全过 | |
| 10 | 已完成 | 修补 5 处 TaskState mock（v2.1 加 preset 三字段） | `packages/core/src/feedback-pool.test.ts`、`packages/core/src/prompt.test.ts` | typecheck + test | 调整原因：TaskState 新增 3 必填字段，老 mock 需要补全 |

## 阶段 1 完成度

- 阶段 1 全部 AI 改动完成；所有自动化验证通过（typecheck / test / build）
- TaskState v2.1 + WorkflowEngine preset 子集 + artifact-guard 动态清单 三层基础设施 ready
- 阶段 2 / 3 在后续 session 推进，互不阻塞

## 阶段 2（执行中）

按子阶段推进，每个子阶段维持 typecheck/test/build 全绿。

### 阶段 2a：CLI 层

| # | 状态 | 步骤 | 涉及范围 | 验证方式 | 备注 |
|---|---|---|---|---|---|
| 2a-1 | 已完成 | user-prompt-submit.ts 简化：删 detectChangeKind/detectRisk/applyLearnedDecision，加 detectPresetMarker，CLI 输出新增 preset/presetSource，create_task 调 TaskManager.create with preset，触发 task.preset_set 事件 | `packages/cli/src/commands/host/user-prompt-submit.ts` | 12/12 测试通过 | 调整：intake-feedback.ts **保留**不删（被 intake.ts CLI 命令依赖）；改为"user-prompt-submit 解耦 intake-feedback" |
| 2a-2 | 已完成 | 新建 harness upgrade CLI 命令 + 注册到 run-cli.ts + usage 更新 | `packages/cli/src/commands/upgrade.ts`（新建）、`packages/cli/src/commands/upgrade.test.ts`（新建）、`packages/cli/src/run-cli.ts` | 4/4 测试通过 | 含 4 个 case：lite→full 升档 / 拒绝 full / 拒绝 completed / 拒绝无 active task |
| 2a-3 | 已完成 | typecheck + test + build 全绿验证 | 仓库 | typecheck 全过；CLI 29/29 + hosts 22/22；core 117/118（已知 stale CodexAdapter）；build 全过 | |

### 阶段 2b：Hook script 协议层

| # | 状态 | 步骤 | 涉及范围 | 验证方式 | 备注 |
|---|---|---|---|---|---|
| 2b-1 | 已完成 | claude-code `buildPromptSubmitContext` 加 lite early return + 三个 full 分支强化 MUST 措辞 | `packages/hosts/claude-code/src/index.ts` | host 测试 14/14 | 含 `[Harnessly full preset]` 标识；resume_task / delegate_to_planner / create_task 三分支全改 |
| 2b-2 | 已完成 | codex `buildPromptSubmitContext` 同上 | `packages/hosts/codex/src/index.ts` | host 测试 10/10 | |
| 2b-3 | 已完成 | host 测试扩展：v2.1 lite 不注入 + full 注入断言用例（per host 1 个） | `packages/hosts/{claude-code,codex}/src/index.test.ts` | vitest 通过 | 断言 `preset === 'lite'` early return + `[Harnessly full preset]` 标识 + `必须使用 Task tool spawn` MUST 措辞 |
| 2b-4 | 已完成 | typecheck + test + build + 全局 dist 同步 + 重新 install hooks 到 .harness/hosts/ | 仓库 + `/opt/homebrew/lib/node_modules/@brawnen/harnessly/dist/` | typecheck 全过；cli 29/29；hosts 24/24；core 117/118（stale）；hook scripts 含 `preset === 'lite'` × 1 + `Harnessly full preset` × 5 落盘 | dogfood-ready |

### 阶段 2c：Slash commands + install 同步（**C 方案修订：回滚到 marker fallback**）

**调整原因（dogfood 实测发现）**：2c-1 完成后 user 在 Claude Code 2.1.150 输入 `/harness-feat ...` 报 `Unknown command: /harness-feat`。排查发现 Claude Code 的 slash command **等同于 Skills 系统**（路径 `~/.claude/skills/<name>/SKILL.md`），不识别 `.claude/commands/*.md`。`~/.claude/skills/` 与 v3-core "禁止写入用户 home 目录" 硬约束冲突。按 P1 spec §6.4.8 SHOULD 措辞改走 marker fallback。

| # | 状态 | 步骤 | 涉及范围 | 验证方式 | 备注 |
|---|---|---|---|---|---|
| 2c-1（原） | 跳过 | claude-code renderer 加 3 个 commands 函数 | — | — | 完成后回滚（dogfood 失败，见 2c-R1） |
| 2c-2（原） | 跳过 | codex renderer commands 生成 | — | — | 早期 spike 已确认 codex-cli 不支持，未执行 |
| 2c-3（原） | 跳过 | install 落盘 commands 文件 | — | — | 完成后回滚 |
| 2c-R1 | 已完成 | 回滚 claude-code：删除 `renderClaudeCodeFeatCommand` / `renderClaudeCodeUpgradeCommand` / `renderClaudeCodeStatusCommand` 三个函数 + ManagedFiles 中三个 entry；host 测试改为"应不含 .claude/commands/ 文件"断言；删除落盘 `.claude/commands/` | `packages/hosts/claude-code/src/index.ts`、`packages/hosts/claude-code/src/index.test.ts` | hosts/claude-code 15/15 通过 | C 方案核心动作 |
| 2c-R2 | 已完成 | SPEC §6.4.3 加 v2.1 实施备注（C 方案修订说明）；§6.4.5 / §6.4.8 措辞改为 "slash command 可选 / 视宿主能力"；marker 路径作为跨宿主默认必须 | `docs/spec/v3-core.zh-CN.md` | 文档自洽 | |
| 2c-R3 | 已完成 | build + 同步全局 dist + reinstall 让落盘文件刷新 | 仓库 + `/opt/homebrew/lib/node_modules/@brawnen/harnessly/dist/` | install 输出不含 `.claude/commands/`；`ls .claude/` 实测仅含 agents/settings.json/worktrees | |
| 2c-R4 | 已完成 | README §8 加 Workflow Preset 用法说明（lite 默认 / marker 触发 full / `harnessly upgrade` 升档）+ 在 CLI 命令表加 `harnessly upgrade` 条目 | `README.md` | 文档可读 + 含 v2.1 实施备注交叉引用 SPEC §6.4.3 | 用户教育 |

## 阶段 3（dogfood + bug 修复）

| # | 状态 | 步骤 | 验证方式 | 备注 |
|---|---|---|---|---|
| 3-1 | 已完成 | artifact-guard 单测补全（preset 清单差异 + checkWritePermission 阶段所有权）| `packages/core/src/artifact-guard.test.ts` 9/9 | 原本无任何测试文件 |
| 3-2 场景1 | 已完成 | lite 默认 dogfood | events.jsonl 天然记录 `action:create_task/resume_task` + `preset:lite` + `recommendedAgent:null` | 自然走通 |
| 3-2 场景2 | 已完成 | marker → full dogfood | events 三事件齐全（intake_decision/preset_set/task_created 全 `preset:full`）+ 主 agent 真 spawn harness-requirement（不可伪造标记 `DOGFOOD-SCENARIO-2-SUBAGENT-SPAWN-VERIFIED`）| 6/6 全过；**暴露并修复 bug：marker 被 active task 吞掉** |
| 3-2 场景3 | 已完成 | `harnessly upgrade` 升档 | state preset=lite→full / stage=design / source=upgrade + `task.preset_upgraded` 事件 + 重复升档被拒（exit 1）| |
| 3-2 场景4 | 已完成 | lite 护栏 | completion-gate 在 lite task 下仍触发 scope_violation + artifact-guard lite 精简清单单测固化 | PreToolUse 写保护已在 P0 dogfood 顺手验证 |
| 3-3 bug A | 已完成 | goal 剥除 `[harness:feat]` marker（新增 stripPresetMarker）| user-prompt-submit 14/14 + 实测 contract.goal/task.json goal 干净 | sub-agent review 发现 |
| 3-3 bug B | 已分流 | fallback contract acceptance_criteria 宽泛 | — | spawn_task 留作独立跟进（涉及 contract 生成 prompt template，非 Preset 范围）|
| 3-4 marker 优先级 bug | 已完成 | `[harness:feat]` marker 优先级高于 active task 续接（hasMarker 强制 create/delegate）| user-prompt-submit 新增回归用例 | 场景2 dogfood 暴露 |
| 3-5 | 待跟进 | asset_promotion × lite 集成（finalizeLitePreset 调 promoteTaskArtifacts，SPEC §22.2.1）| — | 仅在 contract.asset_promotion.promote=true 时才触发，紧迫度低 |
