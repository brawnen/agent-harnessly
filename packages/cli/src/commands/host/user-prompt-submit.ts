import {
  collectEnabledRoles,
  loadAgentManifests,
  loadHarnessConfig,
  pickRecommendedAgent,
  TaskManager,
  WorkflowEngine,
} from '@brawnen/harnessly-core';
import type {
  PresetSource,
  StageMarker,
  WorkflowPreset,
} from '@brawnen/harnessly-shared';

import { appendHarnessEvent } from '../../utils/events';
import { readActiveTaskId } from '../../utils/hosts';
import { printJson } from '../../utils/output';
import {
  clearPendingDelegation,
  readPendingDelegation,
  writePendingDelegation,
} from '../../utils/planner-fallback';

type PromptAction = 'chat' | 'delegate_to_planner' | 'create_task' | 'resume_task';

/**
 * v2.1: 精简版意图分类结果。
 *
 * 相比 v2.0：
 * - 删除 taskKind / risk / confidence / learnedFrom 字段（不再做启发式分类）
 * - 新增 preset / presetSource 字段（按 SPEC §6.4.3 显式声明）
 *
 * 删除的 reason 旧值（matched_change_intent / matched_question_intent /
 * ambiguous_intent / learned_*）合并为更少的语义：change_intent /
 * question_intent / resume_active_task / explicit_new_task。
 */
interface IntakeDecision {
  action: PromptAction;
  reason:
    | 'empty_prompt'
    | 'host_internal_prompt'
    | 'resume_active_task'
    | 'change_intent'
    | 'question_intent'
    | 'explicit_new_task';
  /** preset 为 'lite' 是默认；'full' 由 marker 触发。chat / resume_task 时取 active task 的 preset */
  preset: WorkflowPreset;
  /** create_task / delegate_to_planner 时记录来源；其他 action 为 null */
  presetSource: PresetSource | null;
}

function isHostInternalPrompt(prompt: string): boolean {
  const normalized = prompt.trim();

  return (
    normalized.includes('You will be presented with a user prompt') &&
    normalized.includes('short title for a task') &&
    normalized.includes('Generate a concise UI title')
  );
}

/** 用户显式要求新建任务（即使已有 active task 也脱离） */
function isExplicitNewTask(prompt: string): boolean {
  return /(新建.*任务|开个新|独立任务|创建.*任务|新需求|另起.*任务|不.*继续)/i.test(prompt);
}

/**
 * 问答类 prompt 识别 —— 不创建任务，让主 agent 自然回应。
 *
 * 保留这一检测的产品原因：lite 默认会创建 task，如果不区分问答 vs 变更，
 * 任何中性 prompt 都会触发任务创建，体验上会让用户疑惑。
 */
function isQuestionOnly(prompt: string): boolean {
  const normalized = prompt.trim();
  const patterns = [
    /^(为什么|为何|怎么|如何|哪里|在哪|能不能解释|请解释|分析一下|看看|查一下)/i,
    /(是什么|有什么区别|原因|怎么看|如何验证|怎么验证|是否|有没有|依据什么)/i,
    /[?？]$/,
  ];
  return patterns.some((p) => p.test(normalized));
}

/**
 * v2.1: 检测 prompt 中的 preset marker (SPEC §6.4.3)。
 *
 * 触发规则：
 * - prompt 含 `[harness:feat]`（大小写不敏感）→ full + prompt_marker
 * - 否则 → lite + slash_command（默认）
 *
 * slash command 入口 `/harness-feat` 由宿主展开成含 marker 的 prompt，
 * 由本函数统一识别；无需在本层区分 slash 与 marker 触发路径。
 */
function detectPresetMarker(prompt: string): { preset: WorkflowPreset; presetSource: PresetSource } {
  if (/\[harness:feat\]/i.test(prompt)) {
    return { preset: 'full', presetSource: 'prompt_marker' };
  }
  return { preset: 'lite', presetSource: 'slash_command' };
}

/**
 * 从 prompt 中剥除 `[harness:feat]` marker，得到干净的任务 goal。
 *
 * marker 是 preset 声明的控制信号（已被 detectPresetMarker 消费），
 * 不应作为 goal 文本的一部分污染 contract.goal / requirement.md 等下游工件。
 */
function stripPresetMarker(prompt: string): string {
  return prompt.replace(/\[harness:feat\]/gi, '').trim();
}

/**
 * classifyPrompt — 入口意图分类（v2.1 精简版）。
 *
 * 决策规则：
 * - 空 prompt → chat
 * - 宿主内部 prompt（如 Codex 生成 title 用）→ chat
 * - 有 active task：
 *   - 显式新任务 → create_task / delegate_to_planner
 *   - 问答 → chat
 *   - 其他 → resume_task（默认续接）
 * - 无 active task：
 *   - 问答 → chat
 *   - 其他 → create_task / delegate_to_planner（按 fallback 配置）
 */
function classifyPrompt(
  prompt: string,
  hasActiveTask: boolean,
  allowFallbackCreate: boolean,
): IntakeDecision {
  if (!prompt.trim()) {
    return {
      action: 'chat',
      reason: 'empty_prompt',
      preset: 'lite',
      presetSource: null,
    };
  }

  if (isHostInternalPrompt(prompt)) {
    return {
      action: 'chat',
      reason: 'host_internal_prompt',
      preset: 'lite',
      presetSource: null,
    };
  }

  const { preset, presetSource } = detectPresetMarker(prompt);
  const hasMarker = presetSource === 'prompt_marker';

  if (hasActiveTask) {
    // v2.1 fix: [harness:feat] marker 是用户的显式声明（SPEC §6.4.3），
    // 优先级高于 active task 续接 —— marker 命中 = 明确要新建 full task。
    if (isExplicitNewTask(prompt) || hasMarker) {
      return {
        action: allowFallbackCreate ? 'create_task' : 'delegate_to_planner',
        reason: 'explicit_new_task',
        preset,
        presetSource,
      };
    }

    if (isQuestionOnly(prompt)) {
      return { action: 'chat', reason: 'question_intent', preset: 'lite', presetSource: null };
    }

    return {
      action: 'resume_task',
      reason: 'resume_active_task',
      preset: 'lite', // resume 不应用 marker；preset 跟随 active task
      presetSource: null,
    };
  }

  if (isQuestionOnly(prompt)) {
    return { action: 'chat', reason: 'question_intent', preset: 'lite', presetSource: null };
  }

  return {
    action: allowFallbackCreate ? 'create_task' : 'delegate_to_planner',
    reason: 'change_intent',
    preset,
    presetSource,
  };
}

/**
 * 推荐 sub-agent（v2.1 调整）。
 *
 * 关键改动（SPEC §6.4.4 / §8）：lite preset 不需要 sub-agent
 * （三阶段由主 agent 直接承担），一律返回 null。
 *
 * full preset 沿用原 role 路由逻辑：delegate_to_planner → 新任务起 spec，
 * resume_task → 当前 stage 对应角色。
 */
async function resolveRecommendedAgent(
  workDir: string,
  action: PromptAction,
  activeStage: StageMarker | null,
  preset: WorkflowPreset,
): Promise<string | null> {
  if (preset === 'lite') {
    return null;
  }
  if (action !== 'delegate_to_planner' && action !== 'resume_task') {
    return null;
  }

  const manifests = await loadAgentManifests(workDir);
  const enabledRoles = collectEnabledRoles(manifests);

  if (action === 'delegate_to_planner') {
    return pickRecommendedAgent('new_task', null, enabledRoles);
  }
  return pickRecommendedAgent('resume_task', activeStage, enabledRoles);
}

export async function runHostUserPromptSubmit(
  flags: Record<string, string | boolean>,
  positionals: string[],
): Promise<void> {
  const workDir = process.cwd();
  const prompt =
    (typeof flags.prompt === 'string' ? flags.prompt : '') || positionals.join(' ').trim();
  const manager = new TaskManager();
  const config = await loadHarnessConfig(workDir);
  const activeTaskId = await readActiveTaskId(workDir);

  // 加载 active task 的 stage + preset（如有），用于续接路由与 preset 判定
  let activeStage: StageMarker | null = null;
  let activePreset: WorkflowPreset | null = null;
  if (activeTaskId) {
    try {
      const ctx = await manager.load(activeTaskId, workDir);
      activeStage = ctx.state.currentStage;
      activePreset = ctx.state.preset;
    } catch {
      // active task 文件存在但工件缺失：忽略，按无 stage 处理
    }
  }

  const pending = await readPendingDelegation(workDir);
  const decision = classifyPrompt(
    prompt,
    Boolean(activeTaskId),
    config.fallbackCreateTaskWithoutPlanner || pending !== null,
  );
  const { action } = decision;

  // 实际生效 preset：resume_task / chat 时跟随 active task；create_task / delegate 时用 detect 出的
  const effectivePreset: WorkflowPreset =
    (action === 'resume_task' || action === 'chat') && activePreset !== null
      ? activePreset
      : decision.preset;

  const recommendedAgent = await resolveRecommendedAgent(
    workDir,
    action,
    activeStage,
    effectivePreset,
  );

  await appendHarnessEvent(workDir, {
    type: 'host.intake_decision',
    host: config.defaultHost,
    action,
    reason: decision.reason,
    preset: effectivePreset,
    presetSource: decision.presetSource,
    activeTaskId,
    activeStage,
    recommendedAgent,
    taskCreated: false,
  });

  if (action === 'create_task') {
    await clearPendingDelegation(workDir);
    // bug A fix: 剥除 marker，避免 [harness:feat] 污染 contract.goal
    const ctx = await manager.create(stripPresetMarker(prompt), workDir, {
      preset: decision.preset,
      presetSource: decision.presetSource ?? 'slash_command',
    });

    // v2.1: 触发 task.preset_set 事件 (SPEC §6.4.7)
    await appendHarnessEvent(workDir, {
      type: 'task.preset_set',
      task_id: ctx.taskId,
      preset: decision.preset,
      source: decision.presetSource ?? 'slash_command',
    });

    const engine = new WorkflowEngine(manager);
    await engine.run(ctx, {
      adapterKind: ctx.config.adapterKind,
      adapterCommand: ctx.config.adapterCommand,
      dryRun: true,
    });

    await appendHarnessEvent(workDir, {
      type: 'host.task_created',
      host: config.defaultHost,
      action,
      activeTaskId: ctx.taskId,
      taskCreated: true,
      preset: decision.preset,
      contractPath: `${ctx.taskDir}/contract.yaml`,
      planPath: `${ctx.taskDir}/plan.md`,
    });

    printJson({
      prompt,
      activeTaskId: ctx.taskId,
      activeStage: ctx.state.currentStage,
      action,
      reason: decision.reason,
      preset: decision.preset,
      presetSource: decision.presetSource,
      taskCreated: true,
      taskId: ctx.taskId,
      contractPath: `${ctx.taskDir}/contract.yaml`,
      planPath: `${ctx.taskDir}/plan.md`,
      recommendedAgent: null,
      autoFallback: pending !== null,
      nextStep: 'review_contract_and_plan',
    });
    return;
  }

  if (action === 'delegate_to_planner') {
    await writePendingDelegation(workDir, prompt);
  }

  printJson({
    prompt,
    activeTaskId,
    activeStage,
    action,
    reason: decision.reason,
    preset: effectivePreset,
    presetSource: decision.presetSource,
    taskCreated: false,
    recommendedAgent,
    fallbackCreateTaskWithoutPlanner: config.fallbackCreateTaskWithoutPlanner,
    autoFallback: false,
    nextStep:
      action === 'resume_task'
        ? 'resume_existing_task'
        : action === 'delegate_to_planner'
          ? 'delegate_to_planner'
          : 'no_action',
  });
}
