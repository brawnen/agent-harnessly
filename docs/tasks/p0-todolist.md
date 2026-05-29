# P0 实施 TODO

## 目标
按 [P0 spec v2](./p0-hook-physical-enforcement.md) 落地 completion-gate 物理阻断:
- `printHookDecision` helper 输出 Claude Code Stop hook 协议
- completion-gate 三个失败分支改用 helper
- Codex 协议 spike + 适配(或拆 P0.1)
- 单测扩展 + 端到端 dogfood

## 边界
- **本次处理**:completion-gate.ts、output.ts、对应单测、Codex spike
- **本次不处理**:user-prompt-submit.ts(推迟 P1)、FYI 注入(明确不做)、Antigravity
- **关键风险**:Claude Code hook 协议字段名版本兼容、Codex 协议可能完全不支持(走 P0.1 拆出)

## TODO List

| # | 状态 | 步骤 | 涉及范围 | 验证方式 | 备注 |
|---|---|---|---|---|---|
| 1 | 已完成 | Codex hook 协议 spike + Claude Code 字段名确认 | `packages/hosts/codex/src/index.ts`、`packages/hosts/claude-code/src/index.ts`、`.harness/hosts/codex/hooks/` | 文件阅读 | **重大发现:hook script 层已实现 decision:'block' 协议翻译,P0 spec v2 §1"缺位"判断错误。详见调整原因** |
| 2 | 阻塞 | 实现 `printHookDecision` + `serializeHookOutput` helper | `packages/cli/src/utils/output.ts` | — | **阻塞原因**:协议翻译已做在 hook script 层,CLI 不需要这个 helper;若强行做反而破坏现有架构分层 |
| 3 | 阻塞 | 改造 completion-gate 三个 block 分支 | `packages/cli/src/commands/host/completion-gate.ts` | — | **阻塞原因**:同上,completion-gate 当前 printJson 输出已经被 hook script 正确消费 |
| 4 | 阻塞 | 单测扩展:P0 §5.1 的 7 个分支 | `completion-gate.test.ts`、`output.test.ts` | — | **阻塞原因**:依赖步骤 2/3 |
| 5 | 阻塞 | 全量 typecheck + test + build | 仓库 | — | **阻塞原因**:依赖步骤 2-4 |
| 6 | 阻塞 | 端到端 dogfood:scope_violation 阻断场景 | Claude Code 真实环境 | — | **阻塞原因**:等待重新评估;但此步骤本身仍然必要(验证现有 hook script 真物理生效) |

## 调整原因

执行步骤 1 时发现:Claude Code 与 Codex 的 hook script 层(由 `renderClaudeCodeHookIo` / `renderCodexHookIo` 生成,落盘到 `.harness/hosts/<host>/hooks/`)**已经实现了完整的 `decision: 'block'` 协议翻译**:

- Claude Code: [`buildCompletionDecision`](packages/hosts/claude-code/src/index.ts#L148-L164) 把 `result.pass === false` 翻译成 `{ decision: 'block', reason: '...' }`
- Codex: [`buildCodexHookOutput`](packages/hosts/codex/src/index.ts#L111-L129) 同理
- 此外 Claude Code 的 [`renderClaudeCodePreToolUseHook`](packages/hosts/claude-code/src/index.ts#L264-L308) 已经对 Edit/Write 工具做了 artifact-guard 物理拦截

P0 spec v2 §1 把"completion-gate.ts 只 printJson"等同于"协议层缺位"是误判,因为 CLI 是业务层、hook script 是协议层,两层分离是正确架构。

## 后续路径(用户决策:A)

走 A 路径(P0 重新定义为 P0' / spec v3)。v3 实施 TODO:

| # | 状态 | 步骤 | 涉及范围 | 验证 |
|---|---|---|---|---|
| v3-1 | 已完成 | claude-code `buildCompletionDecision` 加 blockEscalation 段(blockCount >= 3 追加人工介入提示) | `packages/hosts/claude-code/src/index.ts` | 单测 |
| v3-2 | 已完成 | codex `buildCompletionDecision` 同上 | `packages/hosts/codex/src/index.ts` | 单测 |
| v3-3 | 已完成 | claude-code 新增 blockEscalation 测试用例 | `packages/hosts/claude-code/src/index.test.ts` | 13/13 passed |
| v3-4 | 已完成 | codex 新增 import + blockEscalation 测试用例 | `packages/hosts/codex/src/index.test.ts` | 9/9 passed |
| v3-5 | 已完成 | SPEC §10.3 加"实现路径(参考性)"段,明示 CLI 业务层 + hook script 协议层两层分离 | `docs/spec/v3-core.zh-CN.md` | 文档 |
| v3-6 | 已完成 | P0 spec 重写为 v3(含 v3 修订说明 + 缩窄范围 + 工作量从 2.5 天降至 3 小时) | `docs/tasks/p0-hook-physical-enforcement.md` | 文档 |
| v3-7 | 已完成 | 顺手修 stale typecheck bug:`IntakeDecision.reason` union 缺 `'explicit_new_task'` | `packages/cli/src/commands/host/user-prompt-submit.ts` | typecheck |
| v3-8 | 已完成 | typecheck + 单测 + build 全量验证 | 仓库 | typecheck/test/build 通过 |
| v3-9 | 待验证 | **端到端 dogfood**:Stop hook 阻断 / blockEscalation 提示 / PreToolUse 写保护 三场景 | Claude Code 真实环境 | **需用户人工执行**;详见 P0 spec v3 §5.3 |

### 额外发现(不在 P0 范围)

1. `packages/core/src/execute.test.ts` 的 `CodexAdapter > should use default codex exec command and pass prompt file via stdin` 测试失败:`expected 1 to be +0`。**与 P0 无关**(是 CodexAdapter fake exec mock 的 stale bug),需要单独 task 跟进
2. P1 实施前需重新评估 `user-prompt-submit` 的 `hookSpecificOutput` 注入策略 —— 当前 P1 spec §4.8.1 假设 CLI 输出 protocol 字段,基于 v2 错误前提。需在 P1 spec 加修订段:"按 SPEC §10.3 实现路径,UserPromptSubmit hook 的 spawn 指令注入也应做在 hook script 层(`buildPromptSubmitContext`),而非 CLI 层"


## 备注

- 步骤 6 不依赖前序步骤的 PR 合入,只需 build 出可执行 CLI 即可。完成步骤 5 后可立即让用户做 dogfood
- 若 Codex spike 结果是"协议不支持",拆 P0.1 task 时一并更新 P0 spec §4.4 与 §9
