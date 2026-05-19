# Harnessly V1 Implementation TodoList

## 结论

这份清单不是再次重写设计，而是把 [technical-implementation-plan.md](/Users/lijianfeng/code/pp/agent-harnessly/docs/design/technical-implementation-plan.md) 压成可执行施工单。

执行原则只有三条：

- 先打通 `Claude Code + Codex + manual/headless` 主路径；Codex 以 command bridge 为主路径，hook 作为增强能力
- 先落 repo-local source-of-truth，再生成宿主薄壳
- 先做最小闭环，再补增强能力；不把 V1 做成平台化大重构

---

## 0. 边界与优先级

### P0：V1 必须交付

- `harness init`
- `harness run --dry-run`
- `harness run`
- `harness host install / status / sync`
- `harness host session-start / user-prompt-submit / completion-gate`
- `task create/load/save/resume/list`
- `contract generate + gate + confirm`
- `Claude Code adapter`
- `Level 1 evidence + commit gate + report`
- `manual/headless` 保底路径

### P1：V1 内可延后但建议保留

- `harness eval`
- `harness template promote`
- retry / resume 的细化体验
- 错误提示、CLI 视觉打磨

### P2：Post-V1

- Codex 完整联调
- Gemini CLI 完整联调
- OpenAI provider
- Level 2/3 evaluator 校准
- milestone 拆分与长任务恢复增强

---

## 1. 施工顺序

### Step 1：工程骨架与 schema

目标：仓库具备可开发、可测试、可发布的最小工程结构。

Todo:

- [x] 建立 `pnpm workspace`
- [x] 建立 `packages/shared`
- [x] 建立 `packages/core`
- [x] 建立 `packages/cli`
- [x] 建立 `packages/hosts/shared`
- [x] 建立 `packages/hosts/claude-code`
- [x] 接入 `typescript + tsup + vitest`
- [x] 写出 `contract/config/report/template` 的 Zod schema
- [x] 明确 `packages/*` 的导出边界

完成标准：

- `pnpm install`
- `pnpm -r build`
- `pnpm -r test`

---

### Step 2：repo-local 初始化与 host source-of-truth

目标：跑通 `harness init`，能生成 `.harness/` 与 Claude Code repo-local 薄壳。

Todo:

- [x] 实现 `cli init`
- [x] 创建 `.harness/hosts/`、`.harness/tasks/`、`.harness/templates/`
- [x] 生成 `.harness/harness.config.yaml`
- [x] 生成 `.harness/GLOBAL_RULES.md`
- [x] 实现 host manifest schema
- [x] 实现 host shell writer
- [x] 实现 Claude Code repo-local shell 生成
- [x] 生成 Claude Code Planner / Evaluator sub-agent 定义文件
- [x] 实现 `harness host install`
- [x] 实现 `harness host status`
- [x] 实现 `harness host sync`

完成标准：

- 在真实 repo 中执行 `harness init --host claude-code`
- `.harness/hosts/*.yaml` 成为唯一事实源
- `.claude/*` 仅为生成产物
- 不写用户 home 目录

---

### Step 3：task 最小持久化

目标：`dry-run` 不是纯内存演示，而是有 task 落点和续接能力。

Todo:

- [x] 实现 `TaskManager.create()`
- [x] 实现 `TaskManager.load()`
- [x] 实现 `TaskManager.resume()`
- [x] 实现 `TaskManager.listTasks()`
- [x] 实现 active task 索引
- [x] 实现最小 `TaskState`
- [x] 约定 `.harness/tasks/<task-id>/` 文件布局
- [x] 实现 `cli list`

完成标准：

- 运行一次 `harness run --dry-run "修复登录 bug"` 后产生 task 目录
- `harness list` 能读出 task 摘要
- 中断后可按 task id 续接

---

### Step 4：contract 闭环

目标：先把“进入执行前的主动建模”做实，而不是先上 execute。

Todo:

- [x] 实现模板注册表
- [x] 实现模板匹配器
- [x] 实现 LLM client 抽象
- [x] 实现 Anthropic provider
- [x] 实现 contract generator
- [x] 实现 contract gate
- [x] 实现 plan generator
- [x] 实现 `harness run --dry-run`
- [x] 实现用户确认交互
- [x] 落盘 `contract.yaml` 与 `plan.md`

完成标准：

- `harness run --dry-run "<goal>"` 能生成合法 contract
- contract gate 能明确拦截不合格 contract
- 用户确认后 task 进入可执行状态

---

### Step 5：Claude Code 宿主最小接入

目标：让主路径优先通过宿主进入，而不是让用户退回 adapter-first。

Todo:

- [x] 实现 `harness host session-start`
- [x] 实现 `harness host user-prompt-submit`
- [x] 实现 `harness host completion-gate`
- [x] 在 Claude Code 薄壳中接入最小 lifecycle
- [x] 只启用 `SessionStart` / `UserPromptSubmit` / `Stop`
- [x] 确保无 hook 时可退回 `harness run --dry-run`
- [x] 输出最小摘要，不制造噪音

完成标准：

- synthetic payload 可验证三件套命令
- 真实 repo 中 Claude Code 可通过宿主入口创建/续接 task
- 未完成 verify/report 时 `completion-gate` 能阻断“宣称完成”

---

### Step 6：execute + verify 主路径

目标：先打通 `Claude Code + Codex + manual/headless`，这是 V1 成败线。

Todo:

- [x] 实现 `Adapter` 接口
- [x] 实现 `ClaudeCodeAdapter`
- [x] 实现 `CustomAdapter`
- [x] 实现 prompt assembler
- [x] 实现 workflow engine
- [x] 实现 Level 1 evidence collector
- [x] 实现 `build/lint/typecheck/test` 检查
- [x] 实现 scope check
- [x] 实现 commit gate
- [x] 实现 report 生成
- [x] 实现 `harness run` 完整模式

完成标准：

- 在真实项目中完成一个 bug-fix 任务
- 在真实项目中完成一个 feature-simple 任务
- `manual/headless`、Claude 宿主路径、Codex command bridge 主路径都能产出 `report.json`

---

### Step 7：P1 能力补齐

目标：把验证与模板复用做成单独能力，但不阻塞 V1 核心交付。

Todo:

- [x] 实现 `harness eval`
- [x] 实现 Level 2 contract-driven validation
- [x] 实现 `harness template promote`
- [x] 实现 retry / resume 的反馈链路
- [x] 完善 CLI 体验与错误信息（补齐 `harness status`、强化 `list` 摘要、补友好报错）

完成标准：

- `harness eval` 可对已有 task 独立重验证
- `harness template promote` 只允许从通过 gate 的 task 提升模板

---

## 2. 宿主接入分级

### 主支持

- Claude Code
- Codex

要求：

- [x] `init`
- [x] `session-start`
- [x] `user-prompt-submit`
- [x] `completion-gate`
- [x] 真实 repo smoke test

Codex 补充要求：

- [x] repo-local `.codex/*` 薄壳生成
- [x] 生成 Codex Planner / Evaluator sub-agent 定义文件
- [x] `adapter_kind=codex` 默认接线
- [x] command bridge wrapper 生成
- [x] 真实 `codex exec` command bridge 主路径回归
- [ ] hooks 增强链路在可用运行时下补充验证

### 实验性支持

- Gemini CLI

---

## 3. 首批落地建议

如果按最小风险推进，第一批代码提交只做下面 4 件事：

1. 工程骨架：workspace、packages、tsconfig、build/test 基础设施
2. shared schema：contract/config/report/template
3. `cli init` + `.harness/` scaffold
4. host manifest + Claude Code shell writer + `host install/status/sync`

原因：

- 这是所有后续能力的地基
- 不依赖 LLM provider
- 不依赖真实 adapter
- 验证快，回滚简单

---

## 4. Definition of Done

### V1 可进入试用的标准

- [ ] Claude Code 主路径跑通
- [x] `manual/headless` 保底路径跑通
- [x] `init -> dry-run -> run -> report` 主链路成立
- [x] Level 1 evidence 与 commit gate 可工作
- [x] task 状态可持久化、可恢复
- [x] repo-local 宿主薄壳与 `.harness/hosts/*.yaml` 不漂移

当前唯一阻塞项：

- Claude Code 真实主路径联调仍受外部模型额度限制；代码与宿主壳层已就绪，待额度恢复后补最终 smoke evidence
  已验证现象：本机 `claude -p --verbose --output-format stream-json --include-hook-events ...` 已进入 Claude Code 真实启动流程，但在模型调用阶段返回 quota 403，而非本地 hook/壳层错误

### 不纳入 V1 阻塞项

- [ ] Gemini CLI 完整正式支持
- [ ] OpenAI provider
- [ ] evaluator 高级校准
- [ ] 长任务 milestone 拆分
