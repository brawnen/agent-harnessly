# Harnessly 试用说明书

## 结论

Harnessly 的**产品主路径**不是让用户每天在宿主外手工执行一套 Harnessly CLI，  
而是：

- 用户继续在 `Claude Code / Codex` 中工作
- Harnessly 在宿主内自动介入
- `harnessly run / eval / status` 只作为 fallback / debug / CI / manual-headless 入口

当前试用范围仍然是：

- `Claude Code`
- `Codex`
- `manual/headless`

但当前已拿到真实闭环证据的路径是：

- `Codex command bridge`
- `manual/headless`

`Claude Code` 的代码和宿主壳层已经就绪，但最近一次真实联调卡在外部 quota 403。  
因此这份试用说明会区分：

- **用户主路径**：在宿主内使用 Harnessly
- **内部验证路径**：在宿主外用 Harnessly CLI 做排障或验证

---

## 1. 试用边界

本轮试用只关注以下能力：

- `init`
- `run --dry-run`
- `run`
- `status / list`
- `host install / status / sync`
- `report.json`
- Level 1 evidence + commit gate

本轮**不纳入试用阻塞项**：

- `Gemini CLI`
- OpenAI provider
- Level 3 evaluator 校准
- milestone 长任务拆分

---

## 2. 环境要求

最低要求：

- Node.js 22+
- `pnpm`
- 本地可执行的 `Codex` 或 `Claude Code`

当前仓库尚未发布 npm 包，试用时直接使用本地构建产物：

```bash
pnpm install
pnpm build
```

CLI 入口：

```bash
node /Users/lijianfeng/code/pp/agent-harnessly/packages/cli/dist/index.js
```

为方便演示，下面统一记作：

```bash
alias harnessly='node /Users/lijianfeng/code/pp/agent-harnessly/packages/cli/dist/index.js'
```

---

## 3. 用户主路径

### 3.1 Codex 主路径

适用场景：

- 希望继续在 `Codex` 中直接工作
- 不想改变原有 coding agent 使用习惯

一次性初始化：

```bash
harnessly init --host codex
```

初始化后会生成：

- `.harness/`
- `.codex/config.toml`
- `.codex/hooks.json`
- `.codex/agents/harness-planner.toml`
- `.codex/agents/harness-evaluator.toml`
- `.harness/hosts/codex/hooks/*`

初始化后，**日常不是先跑 `harnessly run`**。  
更符合产品目标的用法是：

1. 打开 `Codex`
2. 在当前 repo 内直接提任务
3. Harnessly 通过 repo-local 宿主壳层自动介入

当前实现说明：

- `Codex` 以 **command bridge** 为主路径
- `SessionStart / UserPromptSubmit` hook 只作为增强能力
- `harness-planner / harness-evaluator` sub-agent 定义文件已生成，目标是让宿主主 Agent 优先把 Planning / Evaluation 职责委派出去
- 如果宿主支持 plan mode，Planner 应优先借用宿主 plan mode 做目标澄清与范围建模，再把结果落到 Harnessly contract / plan
- `UserPromptSubmit` hook 默认只做意图分类和 Planner 委派提示，不直接创建 task；只有显式打开 `fallback_create_task_without_planner` 时才降级创建
- Planner / Evaluator 的模型应支持后续通过 repo-local 配置覆盖；当前生成文件里的模型值是默认建议，不应被理解为产品硬编码
- 当前验收仍以 `.harness/tasks/<task-id>/contract.yaml`、`plan.md`、`report.json` 为准，不能以 sub-agent 的自然语言回复替代
- 用户侧不应把外部 Harnessly CLI 当成日常主入口

如果你在试用阶段需要确认当前 repo 状态或排障，可再使用：

```bash
harnessly status
harnessly list
```

如需调整 Planner / Evaluator 模型，可修改 `.harness/harness.config.yaml` 后执行 `harnessly host sync`：

```yaml
planner_use_host_plan_mode: true
planner_model_codex: gpt-5.4-mini
evaluator_model_codex: gpt-5.4
```

#### 验证 sub-agent 是否真实启动

不能只通过 `.codex/agents/harness-planner.toml`、`.codex/agents/harness-evaluator.toml`
是否存在来判断 sub-agent 已启动。定义文件只说明宿主具备发现入口，真实启动必须看
repo-local evidence。

当前验证标准是查看 `.harness/events.jsonl`：

```bash
tail -n 20 .harness/events.jsonl
```

新改动任务的期望事件链：

```text
host.intake_decision action=delegate_to_planner taskKind=<kind>
subagent.started agent=harness-planner model=<planner-model>
```

完成声明或 completion gate 触发后的期望事件链：

```text
host.completion_gate_blocked reason=report_not_ready
subagent.started agent=harness-evaluator model=<evaluator-model>
eval.report_written taskId=<task-id>
```

如果只有 `host.intake_decision action=delegate_to_planner`，但没有
`subagent.started agent=harness-planner`，说明当前宿主没有真实启动 Planner，
至少 repo-local 证据层面不能证明启动；此时应降级到 hook / command bridge /
manual-headless。

注意：手工执行 `harnessly host agent-event --agent harness-planner --event started`
只能验证打点命令和 `.harness/events.jsonl` 写入链路可用，不能证明 Codex 或
Claude Code 宿主真实启动了 sub-agent。只有在宿主自动委派后由 sub-agent
自己写入的 `subagent.started`，才算真实启动证据。

---

### 3.2 Claude Code 主路径

适用场景：

- 希望继续在 `Claude Code` 中直接工作

一次性初始化：

```bash
harnessly init --host claude-code
```

会生成：

- `.harness/`
- `.claude/settings.json`
- `.claude/agents/harness-planner.md`
- `.claude/agents/harness-evaluator.md`
- `.harness/hosts/claude-code.yaml`

初始化后，产品主路径应是：

1. 打开 `Claude Code`
2. 在当前 repo 内直接发任务
3. Harnessly 通过 repo-local hooks 自动介入

排障时可用的最小入口命令：

```bash
harnessly host session-start
harnessly host user-prompt-submit --prompt "继续当前任务"
harnessly host completion-gate --message "已完成"
```

当前状态说明：

- `Claude Code` 壳层与 hook 三件套已实现
- `harness-planner / harness-evaluator` sub-agent 定义文件已生成
- 设计决策是优先让宿主主 Agent 委派 Planner / Evaluator，但必须保留 hook 三件套与命令桥接作为降级路径
- `SessionStart` 只注入上下文；`UserPromptSubmit` 默认引导 Planner；`Stop` 作为 completion gate 防漏
- 如果 Claude Code plan mode 可用，Planner 优先在 plan mode 内完成 contract 前的计划确认；模型选择后续通过 repo-local 配置覆盖
- synthetic payload 和本地命令链已验证
- 最近一次真实 CLI 联调卡在外部 quota 403，而不是本地 hook/壳层错误

因此：

- 如果你本机 `Claude Code` 额度正常，可继续做真实 smoke
- 如果仍遇到额度或认证问题，不要把外部 Harnessly CLI当成正式替代主路径；先转 `Codex` 或 `manual/headless` 试用

Claude Code 模型配置同样来自 `.harness/harness.config.yaml`：

```yaml
planner_model_claude_code: haiku
evaluator_model_claude_code: sonnet
```

---

### 3.3 manual/headless 保底路径

适用场景：

- 不依赖任何宿主 hook
- CI、脚本、显式命令触发
- 需要稳定复现 Harnessly 主链路
- 这是 fallback / debug / CI 路径，不是产品日常主入口

最小闭环：

```bash
harnessly init --host codex
harnessly run --dry-run --skip-confirm "在仓库根目录创建 result.txt，内容为 ok"
harnessly run --skip-confirm --adapter custom --adapter-command 'printf ok > result.txt' "在仓库根目录创建 result.txt，内容为 ok"
harnessly status
```

说明：

- 这是当前最稳的保底入口
- 即使宿主 hook 运行时不稳定，也不影响这条链路

---

## 4. 内部验证路径

以下命令适合：

- 验证实现是否闭环
- 本地排障
- CI / 自动化验证

它们**不是** Harnessly 的最终主用户路径。

### 路径 A：最快看到结果

```bash
pnpm install
pnpm build
cd <你的测试仓库>
harnessly init --host codex
harnessly run --dry-run --skip-confirm "在仓库根目录创建 result.txt，内容为 ok"
harnessly run --skip-confirm "在仓库根目录创建 result.txt，内容为 ok"
harnessly status
```

成功标志：

- 生成 `.harness/tasks/<task-id>/`
- 生成 `contract.yaml`
- 生成 `plan.md`
- 生成 `report.json`
- `status` 中看到：
  - `status: passed`
  - `report_ready: true`
  - `commit_ready: true`

---

### 路径 B：只验证 contract 闭环

```bash
harnessly run --dry-run --skip-confirm "修复登录异常"
harnessly status
```

成功标志：

- `contract_ready: true`
- `plan_ready: true`
- `status: ready`

---

### 路径 C：验证 host shell 安装状态

```bash
harnessly host status --json
harnessly host sync --host codex
```

成功标志：

- `manifest: present`
- `shell: installed`
- Codex 目录包含 `.codex/agents/harness-planner.toml` 和 `.codex/agents/harness-evaluator.toml`
- Claude Code 目录包含 `.claude/agents/harness-planner.md` 和 `.claude/agents/harness-evaluator.md`

---

## 5. 如何判断试用成功

最低成功标准：

- 能初始化 `.harness/` 与 repo-local 宿主薄壳
- 能生成 contract 和 plan
- 能执行一个最小任务并产出 `report.json`
- `status` 显示 `commit_ready: true`
- task 可被 `list/status` 读取

当前已拿到真实证据的路径：

- `Codex command bridge`
- `manual/headless`

---

## 6. 常见问题

### 6.1 `Claude Code` 联调报 quota / auth 问题

现象：

- `claude -p ...` 返回 quota 403 或认证错误

处理：

- 先确认本机 `Claude Code` 账号状态
- 不要阻塞当前试用，先切到 `Codex` 或 `manual/headless`

---

### 6.2 `Codex` hook 看起来没触发

说明：

- 试用主路径不依赖 `Codex hooks`
- 当前 `Codex` 以 `command bridge` 为主路径
- hook 只作为低频安全网，不影响主闭环验收
- `UserPromptSubmit` hook 默认不会创建 task，而是提示委派 `harness-planner`

---

### 6.3 `harnessly` 命令找不到

说明：

- 当前还没发布全局包
- 直接用本地构建产物即可

示例：

```bash
node /Users/lijianfeng/code/pp/agent-harnessly/packages/cli/dist/index.js status
```

---

## 7. 建议反馈内容

试用时如果遇到问题，建议至少记录：

- 宿主：`Codex / Claude Code / manual-headless`
- 执行命令
- `status` 输出
- `report.json`
- 是否生成了目标文件
- 是否有额度/认证/权限类外部错误

---

## 8. 当前建议

如果你今天就要开始试用，建议顺序：

1. 先在目标 repo 里执行一次 `harnessly init --host <宿主>`
2. 日常优先回到 `Codex / Claude Code` 内直接使用
3. 需要验证或排障时，再使用本文的内部验证路径
4. 当前若要立刻拿到稳定闭环证据，先跑 `Codex command bridge`，再跑 `manual/headless`

这样既不改变产品主路径，也不会让外部额度问题阻塞试用启动。
