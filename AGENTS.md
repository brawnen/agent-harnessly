# Harnessly Product Guardrails

本文件定义 `agent-harnessly` 的**产品统一步调与工程交付标准**。
所有设计、实现、文档必须服从以下约束。若有冲突，以本文件为准。

---

## 1. 产品核心定位

**Harnessly 是构建在 coding agent 之上的“工程交付控制层”。**

- **本质**：不是新的 agent 或 runtime，而是针对 agent 产出的**约束（Contract）**、**编排（Workflow）**、**门禁（Gate）**与**证据（Evidence）**。
- **交付目标**：用真实的验证结果（而非 Agent 自述）来判定任务是否完成。

---

## 2. 交互与接入原则

### 2.1 宿主优先 (Host-First)
- **主路径**：用户继续在已有宿主（Claude Code / Codex / Gemini CLI）内工作。
- **介入方式**：寄生式自动介入。严禁要求用户改变使用习惯跳出宿主执行 CLI。
- **CLI 角色**：仅限 fallback、debug、CI 或 headless 自动化场景。

### 2.2 三大宿主目标
- **Claude Code**: `hook-first` 自动介入。
- **Codex**: `command bridge` 闭环。即使宿主 hook 不稳定，也必须在宿主内完成流程。
- **Gemini CLI**: 当前非主线目标。

### 2.3 低频干预
- 仅介入关键节点：`SessionStart` / `UserPromptSubmit` / `Stop`。
- 不做执行期的细粒度运行时控制（如 Pre/PostToolUse）。

---

## 3. 工程实现原则

### 3.1 Repo-Local Kernel
- **唯一事实源**：所有状态与工件必须落在仓库内（`.harness/`）。
- **生成物隔离**：`.claude/`、`.codex/` 等宿主配置必须是从 `.harness/hosts/` 生成的薄壳，不承载真实状态。
- **严禁污染 Home 目录**：禁止将宿主配置或任务状态写入 `~/` 目录。

### 3.2 交付闭环标准
- **主干流程**：`Contract → Plan → Execute → Verify → Commit Gate`。
- **证据优先**：完成判定的唯一依据是验证结果、Gate 状态和 `report.json`。

### 3.3 Sub-Agent 使用原则
- **职责不是实例**：Planner / Generator / Evaluator 是职责角色，不是固定进程、固定 agent 或固定 sub-agent 架构。
- **可选优先策略**：当宿主原生支持 sub-agent 且 repo-local 配置稳定时，Planner 和 Evaluator 可以优先由宿主 sub-agent 承担。
- **Generator 默认归宿主主 Agent**：代码实现默认仍由用户正在使用的主 Agent 承担，不额外派生 Generator sub-agent。
- **不得替代 repo-local kernel**：sub-agent 只能作为宿主内主路径的实现策略，不能替代 `.harness/` 的 contract、plan、report、gate、evidence。
- **不得变成多 agent runtime**：不得把 Harnessly 改造成固定三 agent 编排系统；如果 sub-agent 能力不稳定，必须可降级到 hook / command bridge / manual-headless 路径。

---

## 4. 开发约束与红线

1. **禁止路径倒置**：任何只能通过 `harnessly run` 跑通的方案均为不合格实现。
2. **禁止状态倒置**：严禁以宿主配置（如 `.claude/`）作为 Source-of-Truth。
3. **禁止口头完成**：Agent 自述“已修复”不具备效力，必须通过 Gate。
4. **禁止过度设计**：第一版不做无限编排，不堆砌无法删减的 runtime 技巧。
5. **一致性检查**：当技术方案推动 CLI-first 或要求用户改变习惯时，必须立即回退并修正。

---

## 5. 核心问题自检

> **用户创建一个新项目后，打开已有 coding agent，如何在不改变核心使用习惯的前提下使用 Harnessly？**

如果回答不是**“在宿主内自动介入”**，则实现方向偏离。
第一版目标不是做“最智能的 agent 编排系统”，而是做“最可落地的交付闭环”。

第一版必须稳定交付：

- `harness init`
- `harness run --dry-run`
- `harness run`
- `harness host install / status / sync`
- `harness host session-start / user-prompt-submit / completion-gate`
- `task create/load/save/resume/list`
- `contract -> plan -> execute -> verify -> commit gate`
- Level 1 evidence
- `report.json`

第一版的主干流程固定为：

`Contract -> Plan -> Execute -> Verify -> Commit Gate`

不要把第一版做成可无限编排的平台，不要把简单问题升级成复杂调度系统。

---

## 6. 当前开发约束

### 约束 1：不能把验证路径误写成产品主路径

如果某个实现只能通过：

- 用户手工运行 `harnessly run`
- 用户跳出宿主后自己做 intake / confirm / execute

才能成立，那么它最多只能算 fallback/debug 路径，不算产品主路径完成。

### 约束 2：Codex 完整流程必须完成，但不等于 hook 必须成为唯一主路径

Codex 的产品目标是：

- 用户继续在 Codex 中工作
- Harnessly 在 Codex 内完成完整流程

允许内部采用：

- command bridge
- wrapper
- repo-local shell

但**不允许**把“用户手工在宿主外桥接”当成最终使用方式。

### 约束 3：证据优先于对话

“模型说完成了”永远不算完成。  
完成只能由以下内容支撑：

- 验证结果
- gate 结果
- `report.json`
- 真实工件状态

### 约束 4：模型变强时，控制层应允许删减

后续实现不要继续堆 runtime 技巧。  
每增加一个 harness 机制，都要先问：

- 它是在补产品层缺口，还是只是在补当前模型短板？

如果只是后者，必须保持可删减、可降级。

---

## 7. 文档与实现一致性要求

当出现以下冲突时，必须立即回收并修正：

- 产品文档说“宿主内主路径”，实现却在推动 CLI-first
- 技术方案说“repo-local kernel”，实现却把宿主配置当事实源
- 试用文档写成“用户必须改变既有 coding agent 使用习惯”
- 为了拿到验证证据而临时采用的路径，被误写成正式产品路径

实现、试用文档、技术方案必须同时回答同一个问题：

> 用户创建一个新项目后，打开已有 coding agent，如何在**不改变核心使用习惯**的前提下使用 Harnessly？

如果回答不是“在宿主内自动介入”，那实现方向就是偏了。
