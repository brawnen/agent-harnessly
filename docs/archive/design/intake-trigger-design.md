# Intake Trigger 机制重设计

> 状态：讨论稿，未落地。本文档记录对任务创建触发机制的重新设计决策，后续实现时以此为参照。

## 1. 问题定义

当前 intake 机制（`classifyPrompt`）通过关键词/语义分析猜测用户意图，决定是否创建新任务或委派 sub-agent。运行中暴露出三个问题：

1. **意图分析不可靠**：关键词匹配覆盖面过宽（"修改/添加/更新/优化" 几乎命中所有 prompt），产生大量误判；同时又过窄（"继续" 之外的续接意图无法识别），导致漏判。
2. **Token 消耗过大**：每次命中变更关键词 → `delegate_to_planner` → spawn sub-agent → sub-agent 独立构建上下文 → 生成 contract/plan。实际上大部分日常对话只是在续接当前功能，不应走此流程。
3. **sub-agent 启动规则模糊**：何时 spawn requirement/designer/reviewer/tester 缺乏清晰边界，用户无法预测系统行为。

**核心结论**：意图分析是一个死胡同。不应该让机器猜测"用户这句话是什么意思"。

## 2. 设计决策

**从"推测意图"切换为"读取显式状态"。**

- 旧模型：`自然语言 prompt → classifyPrompt() → 猜测意图 → 决定行为`
- 新模型：`显式声明（文件/命令）→ 读取状态 → 决定行为`

核心原则：

> 人做"声明意图"这件事，机器做"根据声明执行流程"这件事。机器不跨层替人决策。

## 3. 三层模型

```
第一层：触发信号（人负责）
  - 显式命令：harnessly feature start "用户登录"
  - 文件声明：.harness/features/<name>.yaml
  - Git 约定：切换到 feature/<name> 分支

第二层：状态读取（机器负责，SessionStart + UserPromptSubmit）
  - 检查是否有 active feature
  - 检查当前 feature 的阶段（spec/design/execute/review/test）
  - 注入对应的上下文（contract/plan/进度摘要）

第三层：流程执行（机器负责）
  - 0→1（新功能）：SPEC → DESIGN → EXECUTE → REVIEW → TEST → COMMIT_GATE
  - 1→10（续接）：直接 EXECUTE，仅保留 review gate 作为安全网
```

关键约束：**机器不跨层**。第一层的信息只能由人的显式动作产生，机器不替人判断"这算不算新功能"。

### 3.1 0→1 vs. 1→10 的定义

| | 0→1 | 1→10 |
|---|---|---|
| 触发 | 人显式声明新 feature | 默认行为（active feature 存在时） |
| 流程 | 完整五阶段 + sub-agent | 直接 EXECUTE + review gate |
| sub-agent | requirement → designer → reviewer → tester | 仅 reviewer（review gate 时） |
| Token 开销 | 高（结构化产出） | 低（等同于普通对话） |

### 3.2 功能完成的判定（待定）

几种备选方案：

1. **显式 `/feature done`**：用户自己声明功能完成。简单可靠，但依赖用户习惯。
2. **commit_gate pass + push**：代码合并到 main 后自动标记完成。适合有严格 PR 流程的团队。
3. **Session 结束提示**：session 退出时如果 active feature 的 commit_gate 已通过，提示"标记为完成？"。摩擦最小。
4. **Git 事件触发**：feature 分支合并后自动 done。

推荐先用方案 2 + 方案 1 的组合：默认 push to main = done，用户也可以手动提前标记。

## 4. 与现有实现的差距

当前 `user-prompt-submit.ts` 中的 `classifyPrompt()` 需要简化为：

```typescript
function decideAction(hasActiveFeature: boolean, isExplicitNewFeature: boolean): PromptAction {
  if (isExplicitNewFeature) return 'start_feature';
  if (hasActiveFeature) return 'resume_feature';
  return 'idle';
}
```

移除的内容：
- `detectChangeKind()` 关键词匹配
- `isQuestionOnly()` 启发式判断
- `isHostInternalPrompt()` 特殊处理（保留，但独立为预处理步骤）
- `hasActiveTask` 作为续接条件的复杂判断

新增的内容：
- 读取 `.harness/features/<name>.yaml` 状态
- `harnessly feature start` CLI 命令
- SessionStart 注入 feature 上下文

## 5. 不在此文档范围内

- `.harness/features/<name>.yaml` 具体 schema 定义
- 功能看板/进度看板的 UI 形态
- 功能完成的自动判定机制细节
- 跨功能依赖管理
- 向现有 `harness init` 流程的集成方式

以上留待后续设计文档分别展开。

## 6. 参考讨论

- v3-core 产品模型中的"精简工件链"（四文档）可直接复用于 feature 级工件
- `pickRecommendedAgent` 的三意图路由（new_task/resume_task/completion_review）可简化为 feature 阶段路由
- 与 `session-start` hook 的关系：SessionStart 应读取 feature 状态并注入上下文，而非仅检查 active task
