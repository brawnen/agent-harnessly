# Harnessly 产品目标与当前实现对照表

## 结论

本文档用于统一 `agent-harnessly` 的产品定位、主用户路径、当前实现状态和剩余阻塞项。  
后续进入真实项目试用、继续开发、做评审或写试用说明时，默认以本文档为准。

---

## 对照表

| 维度 | 产品目标 | 当前实现状态 | 判断 | 下一步 |
|---|---|---|---|---|
| 产品定位 | Harnessly 是 coding agent 之上的**流程质量层**，不是新的 agent，不是新的 runtime | `contract / workflow / gate / evidence` 主链路已落地；`.harness/` 内核已成型 | 基本对齐 | 保持不再把 runtime 技巧写成产品本体 |
| 主用户路径 | 用户继续在 `Claude Code / Codex` 内工作，Harnessly **宿主内自动介入** | 文档口径已修正；代码里 `host session-start / user-prompt-submit / completion-gate` 已存在 | 方向对齐，证据未全齐 | 补齐 `Claude Code` 真实宿主闭环证据 |
| CLI 角色 | `harnessly run / eval / status` 只做 fallback / debug / CI / manual-headless | 代码已支持；试用文档已区分“用户主路径 / 内部验证路径” | 已纠偏 | 后续不要再把 CLI-first 写成主路径 |
| repo-local kernel | `.harness/` 是唯一事实源；`.claude/`、`.codex/` 只是薄壳 | `.harness/tasks/*`、`.harness/hosts/*`、repo-local host shell 都已生成并可校验漂移 | 已对齐 | 继续保持所有宿主配置从 `.harness/hosts/*` 生成 |
| Contract 闭环 | 必须先 `contract -> plan`，不能直接开干 | `run --dry-run`、contract gate、用户确认、plan 落盘都已完成 | 已对齐 | 下一步只做体验优化，不重写主流程 |
| Execute/Verify 闭环 | 必须有 evidence、gate、report，不能靠 agent 自述完成 | Level 1 evidence、commit gate、`report.json`、`status/list/eval/retry` 都已落地 | 已对齐 | 后续只补更强验证，不动基本闭环 |
| Claude Code 策略 | `hook-first`，宿主内主路径成立 | 壳层、三件套 hook、synthetic payload、本地命令链都已完成；真实 CLI 最近一次卡在外部 quota 403 | **实现基本完成，真实成功证据缺最后一块** | 补一条真实 `Claude Code` smoke |
| Codex 策略 | **完整流程必须完成**；主路径按 `command bridge`，hook 只是增强 | `init --host codex`、repo-local `.codex/*`、wrapper、`adapter_kind=codex`、真实 `codex exec` command bridge 闭环都已跑通 | **已达成主目标** | hook 增强后续补证，不阻塞试用 |
| Planner / Evaluator sub-agent | 可作为宿主主路径增强，但不能替代 repo-local kernel | Claude Code 已生成 `.claude/agents/harness-planner.md`、`.claude/agents/harness-evaluator.md`；Codex 已生成 `.codex/agents/harness-planner.toml`、`.codex/agents/harness-evaluator.toml`；模型和 plan mode 已由 repo-local config 驱动 renderer | **定义文件已落地，进入试用观察** | 主路径优先尝试委派 Planner/Evaluator；Planner 优先利用宿主 plan mode；模型可通过 repo-local 配置覆盖；失败时降级到 hook / command bridge / manual-headless |
| Hook 调用策略 | hook 是低频安全网，不是主流程编排器 | `SessionStart` 只读上下文；`UserPromptSubmit` 默认委派 Planner；`Stop` 保留 completion gate | **需实现默认降噪** | 默认关闭 hook 直接创建 task，只在显式 fallback 时打开 |
| Gemini CLI 策略 | 当前不纳入主线 | 未继续推进 | 符合当前决策 | 暂缓 |
| 用户习惯约束 | 不允许为了使用 Harnessly 改变 coding agent 的核心使用习惯 | 文档层已纠偏；工程层 `Codex` 仍有部分 fallback CLI 路径，但已降级为内部验证路径 | 基本对齐 | 后续所有新文档都遵守 `AGENTS.md` 约束 |
| 试用口径 | 先进入真实项目试用，范围聚焦 `Claude Code + Codex`，`Gemini` 暂缓 | 当前已有 `Codex + manual/headless` 真实闭环证据；`Claude` 缺最终 smoke | **可进入宽松实验** | 先试 `Codex`，`Claude` 额度恢复后补证据 |

---

## 当前唯一阻塞项

- `Claude Code` 真实主路径 smoke evidence 还缺最后一条成功证据。
- 这不是产品方向问题，也不是架构问题，而是当前试用升级时唯一没完全闭环的证据问题。
- Planner / Evaluator sub-agent 目前已生成定义文件，但还缺“宿主主 Agent 真实优先委派并回流结果”的试用证据；这不阻塞当前 command bridge / hook 路径，但会影响后续是否把 sub-agent 写成默认主路径。
- Planner 利用宿主 plan mode、Planner/Evaluator 模型可配置已落到 config schema 与 host renderer 参数化；还缺真实宿主是否稳定采用这些配置的 smoke 证据。

---

## 当前可以对外怎么说

- **产品方向已统一**
- **实现主线已基本成型**
- **Codex 主路径已完成真实闭环**
- **Claude Code 主路径代码已就绪，待补真实 smoke**
- **现在可以进入宽松实验，先在真实项目里试 `Codex + manual/headless`，Claude 随后补齐**

---

## 一句话版

> Harnessly 已经实现成 repo-local 流程质量内核；`Codex` 主路径已真实跑通，`Claude Code` 只差最后一条真实 smoke 证据，因此现在适合进入宽松实验，而不是继续摇摆产品定位。
