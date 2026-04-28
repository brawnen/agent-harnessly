# Harnessly 真实项目试用 Checklist

## 结论

这份清单只服务一个目标：

> 把 Harnessly 放进真实项目里做第一轮试用，并且能拿到可判断、可复盘、可继续迭代的反馈。

当前推荐试用优先级：

1. `Codex`
2. `manual/headless`
3. `Claude Code` 在额度与认证稳定后补真实 smoke

---

## 1. 选项目 Checklist

开始试用前，先确认项目满足以下条件：

- [ ] 项目是你们真实在维护的仓库，不是纯演示仓库
- [ ] 仓库可以接受新增 `.harness/`、`.codex/`、`.claude/` 这类 repo-local 文件
- [ ] 仓库里至少有一条可运行的基本验证命令
  - 例如：`pnpm test`、`pnpm typecheck`、`pytest`、`go test`
- [ ] 项目允许做**小范围、可回滚、低风险**修改
- [ ] 你对该仓库的目录结构和基本业务边界有最少了解
- [ ] 第一轮试用任务不涉及高风险数据变更、生产基础设施、批量删除、复杂迁移

不建议作为第一轮试用对象的项目：

- [ ] 测试几乎完全不可运行
- [ ] 当前工作区改动非常脏，无法分辨 Harnessly 产物
- [ ] 高风险数据库迁移项目
- [ ] 强依赖外网、私有服务、复杂凭证链的项目
- [ ] 你本人都还不熟悉的陌生大仓库

---

## 2. 宿主选择 Checklist

当前建议的试用宿主：

### 路径 A：Codex

适合：

- [ ] 你希望先拿最稳定的真实闭环证据
- [ ] 你接受 `Codex` 当前以 `command bridge` 为主路径

### 路径 B：Claude Code

适合：

- [ ] 你希望验证 hook-first 体验
- [ ] 你本机 `Claude Code` 额度和认证状态正常

### 路径 C：manual/headless

适合：

- [ ] 你只想先验证 Harnessly 内核，不依赖宿主稳定性
- [ ] 你要做排障或 CI 风格验证

---

## 3. 初始化 Checklist

进入真实项目目录后：

```bash
cd /path/to/real-project
```

构建本地 CLI：

```bash
cd /Users/lijianfeng/code/pp/agent-harnessly
pnpm install
pnpm build
```

建议先设 alias：

```bash
alias harnessly='node /Users/lijianfeng/code/pp/agent-harnessly/packages/cli/dist/index.js'
```

回到目标项目后，执行一次初始化：

Codex：

```bash
harnessly init --host codex
```

Claude Code：

```bash
harnessly init --host claude-code
```

初始化后确认：

- [ ] `.harness/` 已生成
- [ ] 对应 repo-local 宿主薄壳已生成
  - Codex：`.codex/config.toml`、`.codex/hooks.json`
  - Codex sub-agent：`.codex/agents/harness-planner.toml`、`.codex/agents/harness-evaluator.toml`
  - Claude Code：`.claude/settings.json`
  - Claude Code sub-agent：`.claude/agents/harness-planner.md`、`.claude/agents/harness-evaluator.md`
- [ ] `harnessly host status --json` 返回 `manifest=present`、`shell=installed`

---

## 4. 第一轮任务选择 Checklist

第一轮任务必须满足：

- [ ] 目标单一
- [ ] 范围小
- [ ] 结果容易验证
- [ ] 回滚简单

推荐的第一轮任务类型：

- [ ] 新增一个非常小的诊断文件
- [ ] 修复一个局部文本/配置错误
- [ ] 补一个低风险脚本输出
- [ ] 修一个局部 bug，且有明确验证动作
- [ ] 给现有模块补一个非常小的功能点

不推荐的第一轮任务类型：

- [ ] 跨模块大重构
- [ ] 多阶段长任务
- [ ] 高风险数据库变更
- [ ] 一次性要求“自动完成一整套复杂需求”
- [ ] 需要多个外部系统联调的任务

推荐第一轮任务模板：

- `在 <路径> 下新增一个最小文件，内容为 <值>`
- `修复 <明确错误>，并通过 <命令> 验证`
- `在 <模块> 增加 <小能力>，并通过 <命令/文件检查> 验证`

---

## 5. 试用执行 Checklist

### 5.1 先验证 contract 闭环

```bash
harnessly run --dry-run --skip-confirm "<goal>"
```

检查：

- [ ] 生成 `.harness/tasks/<task-id>/contract.yaml`
- [ ] 生成 `.harness/tasks/<task-id>/plan.md`
- [ ] `harnessly status` 显示：
  - [ ] `contract_ready: true`
  - [ ] `plan_ready: true`
  - [ ] `status: ready`

### 5.2 再验证真实执行闭环

Codex：

```bash
harnessly run --skip-confirm "<goal>"
```

manual/headless：

```bash
harnessly run --skip-confirm --adapter custom --adapter-command '<your command>' "<goal>"
```

Claude Code：

- [ ] 在 `Claude Code` 内直接对当前项目发起任务
- [ ] 如需排障，再看 `harnessly host session-start / user-prompt-submit / completion-gate`

Planner / Evaluator sub-agent 观察项：

- [ ] 宿主是否能发现 `harness-planner`
- [ ] 宿主是否能发现 `harness-evaluator`
- [ ] `.harness/events.jsonl` 是否出现 `subagent.started agent=harness-planner`
- [ ] `.harness/events.jsonl` 是否出现 `subagent.started agent=harness-evaluator`
- [ ] 如果宿主支持 plan mode，Planner 是否优先利用 plan mode 完成目标澄清和 scope 建模
- [ ] Planner / Evaluator 实际使用的模型是否符合当前 repo 预期
- [ ] 新任务进入执行前，是否优先由 Planner 生成或定位 `.harness/tasks/<task-id>/contract.yaml` 和 `plan.md`
- [ ] 主 Agent 宣称完成前后，是否优先由 Evaluator 读取 evidence / gate / `report.json`
- [ ] 如果 sub-agent 未被宿主稳定调用，是否能降级到 hook / command bridge / manual-headless，不阻断试用

判断说明：

- [ ] 仅有 sub-agent 定义文件不算真实启动证据
- [ ] 手工执行 `harnessly host agent-event ...` 只算 smoke，不能证明宿主真实启动了 sub-agent
- [ ] `host.intake_decision action=delegate_to_planner` 后如果没有 `subagent.started agent=harness-planner`，应记录为宿主未稳定委派 Planner
- [ ] `host.completion_gate_blocked reason=report_not_ready` 后如果没有 `subagent.started agent=harness-evaluator`，应降级执行 `harnessly eval <task-id>`

Hook 安全网观察项：

- [ ] `SessionStart` 是否只注入 active task 摘要，不创建新 task
- [ ] `UserPromptSubmit` 是否默认返回 Planner 委派提示，而不是直接创建 task
- [ ] `Stop / completion-gate` 是否能阻止没有 `report.json` 或 `commit_ready=false` 的口头完成
- [ ] 如确实需要 hook 直接创建 task，是否已显式打开 `fallback_create_task_without_planner`

执行完成后检查：

- [ ] 目标文件/目标行为实际存在
- [ ] `.harness/tasks/<task-id>/report.json` 已生成
- [ ] `harnessly status` 显示：
  - [ ] `status: passed`
  - [ ] `report_ready: true`
  - [ ] `commit_ready: true`

---

## 6. 成功判据 Checklist

一个真实项目试用轮次，最低成功标准：

- [ ] Harnessly 能在该 repo 初始化成功
- [ ] contract 和 plan 能生成
- [ ] 至少有一个真实任务能跑到 `report.json`
- [ ] 最终 `commit_ready: true`
- [ ] task 可以被 `status / list` 正确读取
- [ ] 用户不需要为了闭环去理解内部状态机细节

更高一档成功标准：

- [ ] 用户觉得“主路径没有明显破坏原有 coding agent 使用习惯”
- [ ] 任务失败时，用户能靠 `status / report` 自助定位问题
- [ ] 第二个任务比第一个任务更容易上手

---

## 7. 试用中必须记录的反馈

每次试用至少记录这些信息：

### 基础上下文

- [ ] 项目名
- [ ] 宿主：`Codex / Claude Code / manual-headless`
- [ ] 任务目标
- [ ] 是否第一次在该项目试用

### 过程结果

- [ ] `init` 是否成功
- [ ] `dry-run` 是否成功
- [ ] `run` 是否成功
- [ ] 是否生成 `report.json`
- [ ] 最终是否 `commit_ready=true`

### 用户体验反馈

- [ ] 用户是否感觉需要学习一套新工作方式
- [ ] 用户是否能理解 contract / plan 的作用
- [ ] 用户是否能看懂 `status / report`
- [ ] 哪一步最困惑
- [ ] 哪一步最费时间

### 失败信息

- [ ] 失败发生在哪一步
  - `init`
  - `contract`
  - `plan`
  - `execute`
  - `verify`
  - `host integration`
- [ ] 是产品逻辑问题，还是宿主/额度/认证/权限问题
- [ ] 是否可复现

---

## 8. 常见试用策略

### 策略 A：先拿稳定闭环

适用：

- [ ] 你想先证明产品有价值

做法：

- [ ] 先用 `Codex`
- [ ] 先做低风险最小任务
- [ ] 先拿到 `report.json + commit_ready=true`

### 策略 B：先看宿主体验

适用：

- [ ] 你更关心“是不是像插件一样自然”

做法：

- [ ] 选 `Claude Code`
- [ ] 优先看宿主内自动介入是否顺滑
- [ ] 如果卡在额度/认证，不要把这个归因为 Harnessly 内核问题

### 策略 C：先做排障演练

适用：

- [ ] 你担心试用时一出错就没人知道怎么处理

做法：

- [ ] 先在 `manual/headless` 路径里故意做一次失败任务
- [ ] 看 `status / report / retry` 是否足够支撑排障

---

## 9. 当前推荐顺序

如果你现在就要把产品放进真实项目里，推荐顺序：

1. [ ] 选一个低风险真实仓库
2. [ ] 先用 `Codex` 跑第一轮
3. [ ] 再补一轮 `manual/headless`
4. [ ] `Claude Code` 在本机额度/认证稳定后补 smoke
5. [ ] 记录试用反馈，区分“产品问题”和“宿主外部问题”

---

## 10. 一句话提醒

> 第一轮试用的目标不是证明 Harnessly 无所不能，而是证明它能把一个真实任务从“对话驱动”稳定收敛成“有 contract、有验证、有 report 的交付闭环”。
