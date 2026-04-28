# Host Integration 架构评审

> 评审时间：2026-04-20
> 评审主题：Codex 在技术实现方案中增加的 Host Integration 层
> 评审结论：方向正确，需要补齐四项关键细节

---

## 1. 总体评价

Codex 的改动**整体方向正确**，解决了之前讨论中识别出的根本问题：

**之前的矛盾**：
- adapter 模式让 harness 成为 orchestrator，需要用户改变入口习惯（从 claude-code → harness run）
- 这与"质量层"的定位不符

**Codex 的解法**：
- Host Integration：harness 作为 agent 的工具/插件，寄生在 Claude Code / Codex 内部
- 用户完全无感，继续使用习惯不变
- harness 从"驱动者"变成"监听者"

**结果**：harness 终于找到了正确的产品身份——不是更好的 orchestrator，而是让现有 agent **更可靠的质量层**。

---

## 2. 合理的架构决策

### 2.1 Host 与 Adapter 并存

```
┌────────────────────────────────────────┐
│ Host Integration（日常主路径）           │
│ 寄生在 Claude Code / Codex 内部        │
│ hook / slash command 触发               │
├────────────────────────────────────────┤
│ Execute Adapter（CI/headless 专用）     │
│ subprocess 调用 claude-code 命令        │
└────────────────────────────────────────┘
```

两条路并存，解决了不同场景的需求：
- **日常开发**：host 模式，无摩擦，user 体验最好
- **CI / 批量任务**：adapter 模式，可编程，便于集成
- **高级用户**：`harness run` 显式调用，完全可控

### 2.2 `packages/hosts/*` 独立包隔离

Claude Code / Codex / Gemini CLI 的集成机制差别大（hook 格式、生命周期、能力集），独立包是对的：
- 各 host 可独立演进，不互相污染
- 依赖倒置清晰：core 不依赖 hosts，hosts 依赖 core
- 用户可按需安装（`npm i @harnessly/host-claude-code`）

### 2.3 Capability Manifest + 降级策略

不同 agent 能力差异大（Claude Code hooks 完整，Codex 可能弱），manifest 抽象 + command bridge 降级是标准工程解法。避免硬编码每个 host 的特殊逻辑。

### 2.4 `.harness/hosts/*` 分目录隔离

每个 host 的生成物独占一个目录，避免相互覆盖——符合关注点分离。

---

## 3. 必须补齐的关键细节

### 3.1 🔴 Adapter 和 Host 的主从关系未明确

**问题**：方案保留了 adapter，但没说两者的**互斥关系**和**优先级**。

可能的歧义：
- 用户装了 host integration 后，还能不能用 `harness run`？
- 如果都能用，同一任务走哪条路？会不会重复执行 contract / verify？
- 默认推哪条？`harness init` 时优先装 host 还是 adapter？

**建议**：
- **明确声明** host 是**默认主路径**，用户 0 成本集成
- adapter 降级为 `--headless` / `--ci-mode` 专用，文档中不对等呈现
- 在 CLI help / init 输出中优先推荐 host，把 adapter 标注为"高级 / 脚本化场景"
- 添加检测逻辑：如果检测到运行在 host 环境，`harness run` 输出警告提示改用 host 模式

**具体位置**：补充在 §4.4 宿主接入边界或新增 §5.6 主路径选择指南

---

### 3.2 🔴 Host 写入位置的边界约束

**问题**：host integration 要往哪里写 hook 配置？这触及之前的三层模型边界约定。

| 写入位置 | 归属层级 | v2 §9.4 约定 | 当前风险 |
|---|---|---|---|
| `.claude/settings.json`（仓库） | Repo-Level | ✅ 允许 | 低 |
| `.claude/settings.local.json`（gitignored） | Repo-Level 私有 | ✅ 允许 | 低 |
| `~/.claude/settings.json`（用户 home） | User-Level | ❌ 禁止 | **高** |

**核心约束**（之前已承诺）：harness **绝不碰用户 home 目录**。这保证了：
1. 多个项目不互相污染（每个项目有自己的 `.harness/`）
2. 用户级配置（个人偏好）独立于 repo 配置（项目规范）

**当前风险**：host shell writer 如果默认往 `~/.claude/` 写，会违反这个承诺。

**建议**：
- host shell writer **必须强制**只写仓库级（`.claude/`），禁止 home 路径
- 如果底层 agent（Claude Code）的配置也支持仓库级覆盖（`.claude/settings.local.json`），优先用它
- 在 host manifest 中**声明 write_boundary**：
  ```json
  {
    "name": "claude-code",
    "write_boundary": "repo",  // repo | user | both（forbidden）
    "config_paths": [".claude/settings.json", ".claude/settings.local.json"]
  }
  ```
- init 时检查：如果 host 声明 `write_boundary: user` 或 `both`，直接 fail + 提示用户，不继续

**具体位置**：§4.4 宿主接入边界补充"配置写入约束"小节

---

### 3.3 🔴 Contract 阶段的介入点设计不完整

**问题**：我们已识别出，hook 是**响应式**的，天然适合 verify 阶段。但 **contract 需要在任务开始前介入**，让用户确认 scope / 验收标准 / 风险等级——这个时机 hook 很难覆盖。

Codex 方案里没有明确说 contract 的介入点在哪里。可能的路径：

| 路径 | 机制 | 特点 |
|---|---|---|
| A | Slash Command | `/harness-run 修复登录` → 先生成 contract，用户确认后继续 | 最佳体验 |
| B | Memory File / CLAUDE.md | 在 `.claude/CLAUDE.md` 中指导 agent 接到任务先调 `harness contract generate` | 靠 prompt 约束，不稳定 |
| C | PreSession Hook | 某些 host 支持 task 开始前的钩子 | 不清楚目前支持度 |
| D | Manual Split | 用户分两步：先 `harness contract generate`，再告诉 agent 信息 | 有摩擦 |

**当前方案线索**：
- 方案提到 "shell writer" 和 "command bridge"，可能暗示通过某种 CLI 集成
- 但没有明确哪个 path 是推荐做法

**建议**：
- **为 Claude Code / Codex 各补充一个小节**，说明 contract 阶段的具体介入机制
- 优先级顺序：A(Slash Command) > B(Memory File) > D(Manual)，根据 host 能力选择
- 如果 Claude Code 支持 `/harness-run` slash command（相当于 Claude Code 自带的 command 框架），这是最佳方案，优先推荐
- 在 Phase 1 中补充 host-specific slash commands 的生成逻辑

**具体示例**（Claude Code host）：
```yaml
# .claude/commands/harness-run.md（harness init 时自动生成）
对于编码任务，请按以下流程执行：
1. 先运行 `harness contract generate "<task-description>"` 理解 scope 和验收标准
2. 如果确认无误，开始实现
3. 实现完成后运行 `harness verify` 验证

这确保了修改范围明确、验收标准可测量。
```

**具体位置**：新增 §4.4.2 各 Host 的 Contract 介入设计，分 Claude Code / Codex / Gemini CLI 三小节

---

### 3.4 🟡 Host Capability 矩阵缺失

**问题**：方案声称支持 Claude Code / Codex / Gemini CLI，但没有实际验证每个 host 的能力边界。

- Claude Code 的 hooks：哪些事件有？何时触发？
- Codex CLI 的 hooks 机制：目前是什么状态？文档在哪？
- Gemini CLI：有类似机制吗？

**风险**：
- 如果 Codex / Gemini CLI 的 hook 支持很弱，降级后只能靠 memory file（prompt 约束），可靠性打折扣
- 方案会停留在"理论上可行"阶段，实际落地困难

**建议**：补充一张 **Host Capability 矩阵**：

```markdown
### Host Capability Matrix

| 能力 | Claude Code | Codex CLI | Gemini CLI | 备注 |
|---|---|---|---|---|
| **Pre-Task Hook** | ? | ? | ? | 任务开始前介入（用于 contract） |
| **Post-Task Hook** | ✅ Stop | ? | ? | 任务完成后介入 |
| **Post-Edit Hook** | ✅ PostToolUse | ? | ? | 文件修改后介入（用于 scope check） |
| **Slash Commands** | ✅ /.command | ? | ? | 自定义命令（用于显式调用） |
| **Memory Files** | ✅ CLAUDE.md | ? | ? | 指令注入（用于软约束） |
| **Local Settings** | ✅ .claude/ | ? | ? | 仓库级配置（hook 注册） |
| **支持度评级** | 完整（5/5） | ? | ? | 用于评估初期支持范围 |

---

**说明**：
- `✅` = 支持，`⏳` = 计划中，`❓` = 未验证，`❌` = 不支持
- 初期 Phase 1 **仅支持 Claude Code**（完整），Phase 2 扩展到 Codex / Gemini CLI
```

**目的**：
- 避免过度承诺，明确说"Phase 1 只在 Claude Code 上跑通"
- 给后续 Phase 留出验证期，等实际接入时再补能力矩阵的 ? 号

**具体位置**：§4.4 宿主接入边界之后，新增 §4.5 Host Capability Matrix

---

### 3.5 🟡 `harness host` 子命令可能过度设计

**问题**：新增 `harness host install / uninstall / update` 子命令，增加 CLI 复杂度。

但实际场景：
- 大部分用户在 `harness init` 时一次性装完，后续很少手动管理
- 如果 host 版本跟 harness 主包一起发布，subcommand 反而会造成困惑

**建议**：
- **简化 `harness host` 的职责**，只保留：
  - `harness host status`：显示已安装的 host 及其版本、配置状态
  - `harness host sync`：修复配置漂移（`.claude/settings.json` 被人工修改后，重新同步）
- 删除 `install / uninstall / update`：这些操作改由 `npm i @harnessly/host-*` 或 `pnpm add` 承担
- `harness init` 变成"一键检测 + 安装所有可用 host"

**好处**：
- CLI 更简洁，心智负担低
- 版本管理走标准 npm 机制，避免自造轮子
- 用户只需记住：`harness init` 搞定，`harness host status` 排查，其他的 npm 搞

**具体位置**：更新 §5.1 init 命令和 §5.2 host 子命令（改为 status / sync）

---

## 4. Host Capability 落地验证清单

在最终提交之前，为了验证方案的真实可行性，建议逐项验证：

- [ ] Claude Code 的 hooks 机制（PreToolUse / PostToolUse / Stop 等），文档确认
- [ ] Claude Code 是否支持仓库级 `.claude/` 配置覆盖
- [ ] Codex CLI 的 hook / command 机制，当前 beta 状态
- [ ] Gemini CLI 是否有类似机制，查看官方文档
- [ ] 三个 agent 的配置格式（JSON / YAML / 其他），兼容性检查
- [ ] 跨 OS（macOS / Linux / Windows）的 hook 写入是否有差异

建议 **Phase 1 focus 只在 Claude Code，Codex / Gemini CLI 标记为 WIP**，避免承诺过度。

---

## 5. 实施建议

### 5.1 优先级调整

当前 Phase 顺序，建议改为：

| Phase | 任务 | 产出 | 前提验证 |
|---|---|---|---|
| Phase 1 | **Claude Code Host** 端到端跑通 | .claude/ hook writer + shell generator | 验证清单 ✅ 前 2 项 |
| Phase 2 | 抽象 Host Manifest + Capability 接口 | 可复用框架 | - |
| Phase 3 | Codex CLI Host（可选 Phase 1 中） | codex-specific 实现 | 验证清单 ✅ 第 3-4 项 |
| Phase 4+ | Gemini / 其他 Host | 扩展中 | 验证清单 ✅ 第 5-6 项 |

### 5.2 关键决策点

在开始 Phase 1 实现前，必须确认：

1. **Contract 介入点**：选择 slash command / memory file / 其他？（关系到 shell writer 的复杂度）
2. **Hook 配置格式**：Claude Code 用什么（JSON 还是 YAML）？`.claude/settings.json` 还是 `.claude/harness-hooks.json`？
3. **User Home 边界**：硬约束"不碰 `~/.claude/`"吗？
4. **Adapter 降级**：`harness run` 在 host 环境下是否显示警告？还是自动退化为调用 host API？

没有这些决策，shell writer 和 host manifest 会陷入设计循环。

---

## 6. 总结

| 方面 | 评价 | 优先级 |
|---|---|---|
| 整体架构方向 | ✅ 正确，解决了身份问题 | - |
| Host 与 Adapter 关系 | 🔴 模糊，需明确 | P0 |
| 配置写入边界 | 🔴 风险高，必须硬约束 | P0 |
| Contract 阶段设计 | 🔴 不完整，需补介入点 | P0 |
| Host Capability 验证 | 🟡 缺失，避免纸上谈兵 | P0 |
| `harness host` 命令设计 | 🟡 可简化 | P1 |

**建议**：补齐上述四个 P0 项后，再进入 Phase 1 代码实现。否则会陷入"架构清晰，但实现绕远路"的局面。

---

## 附录：审视之前的矛盾消解

### 之前的根本问题

```
问题 1：harness run 需要用户改变入口习惯
   ↓ 这违反了推广初衷（无摩擦集成）
   ↓
问题 2：orchestrator 和质量层的身份混乱
   ↓ 
问题 3：MCP Server 方案虽然优雅，但实现难度高
```

### Codex Host 方案如何消解

```
Host Integration 方案
   ↓
harness 变成 agent 的工具/插件，而非 agent 的上级
   ↓
用户继续用 Claude Code / Codex，习惯不变
   ↓
harness 通过 hook 在后台监听和验证
   ↓
✅ 推广摩擦消失
✅ 身份明确：质量层（不是 orchestrator）
✅ 实现难度：比 MCP Server 低（不需全新协议）
```

**结论**：Host Integration 方案是**务实与优雅的平衡**，值得继续推进。只需补齐上述细节，就是可以交付的架构。

