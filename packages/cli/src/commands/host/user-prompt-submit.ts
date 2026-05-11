import {
  collectEnabledRoles,
  loadAgentManifests,
  loadHarnessConfig,
  pickRecommendedAgent,
  TaskManager,
  WorkflowEngine,
} from '@brawnen/harnessly-core';
import type { StageMarker } from '@brawnen/harnessly-shared';

import { appendHarnessEvent } from '../../utils/events';
import { readActiveTaskId } from '../../utils/hosts';
import {
  classifyByIntakeFeedback,
  loadIntakeFeedback,
  writeLastIntakeDecision,
} from '../../utils/intake-feedback';
import { printJson } from '../../utils/output';
import { clearPendingDelegation, readPendingDelegation, writePendingDelegation } from '../../utils/planner-fallback';

type PromptAction = 'chat' | 'delegate_to_planner' | 'create_task' | 'resume_task';
type TaskKind =
  | 'bug_fix'
  | 'code_change'
  | 'config_change'
  | 'doc_change'
  | 'test_change'
  | 'refactor'
  | 'question'
  | 'host_internal'
  | 'empty'
  | 'resume';
type IntakeRisk = 'low' | 'medium' | 'high';

interface IntakeDecision {
  action: PromptAction;
  reason:
    | 'empty_prompt'
    | 'host_internal_prompt'
    | 'resume_active_task'
    | 'matched_change_intent'
    | 'matched_question_intent'
    | 'ambiguous_intent'
    | 'learned_exact_feedback'
    | 'learned_similar_feedback';
  taskKind: TaskKind;
  risk: IntakeRisk;
  confidence: number;
  learnedFrom?: string[];
}

function isHostInternalPrompt(prompt: string): boolean {
  const normalized = prompt.trim();

  return (
    normalized.includes('You will be presented with a user prompt') &&
    normalized.includes('short title for a task') &&
    normalized.includes('Generate a concise UI title')
  );
}

function containsAny(prompt: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(prompt));
}

function detectChangeKind(prompt: string): TaskKind | null {
  const normalized = prompt.trim();

  if (containsAny(normalized, [/(修复|修一下|bug|报错|失败|异常|不对|不能|无法|fix)/i])) {
    return 'bug_fix';
  }

  if (containsAny(normalized, [/(文档|README|说明|设计文档|试用文档|更新.*文档|补.*文档)/i])) {
    return 'doc_change';
  }

  if (containsAny(normalized, [/(配置|config|yaml|toml|json|hook|模型配置|设置)/i])) {
    return 'config_change';
  }

  if (containsAny(normalized, [/(测试|用例|test|spec|覆盖)/i])) {
    return 'test_change';
  }

  if (containsAny(normalized, [/(重构|refactor|整理代码|抽象)/i])) {
    return 'refactor';
  }

  if (containsAny(normalized, [/(实现|新增|添加|修改|删除|接入|落地|改造|优化|调整|升级|补上|补充|更新|implement|add|update|remove)/i])) {
    return 'code_change';
  }

  return null;
}

function isQuestionOnly(prompt: string): boolean {
  const normalized = prompt.trim();
  const hasQuestionIntent = containsAny(normalized, [
    /^(为什么|为何|怎么|如何|哪里|在哪|能不能解释|请解释|分析一下|看看|查一下)/i,
    /(是什么|有什么区别|原因|怎么看|如何验证|怎么验证|是否|有没有|\?)$/i,
  ]);

  return hasQuestionIntent && detectChangeKind(normalized) === null;
}

function detectRisk(prompt: string, taskKind: TaskKind): IntakeRisk {
  const normalized = prompt.trim();

  if (containsAny(normalized, [/(数据库|迁移|权限|认证|支付|安全|删除数据|生产|破坏性|高风险|回滚|schema|migration)/i])) {
    return 'high';
  }

  if (taskKind === 'refactor' || containsAny(normalized, [/(跨模块|架构|大范围|重构|多个项目|主路径|runtime)/i])) {
    return 'medium';
  }

  return 'low';
}

function classifyPrompt(
  prompt: string,
  hasActiveTask: boolean,
  allowFallbackCreate: boolean,
): IntakeDecision {
  if (!prompt.trim()) {
    return {
      action: 'chat',
      reason: 'empty_prompt',
      taskKind: 'empty',
      risk: 'low',
      confidence: 1,
    };
  }

  if (isHostInternalPrompt(prompt)) {
    return {
      action: 'chat',
      reason: 'host_internal_prompt',
      taskKind: 'host_internal',
      risk: 'low',
      confidence: 1,
    };
  }

  if (hasActiveTask && /(继续|resume|接着|延续)/i.test(prompt)) {
    return {
      action: 'resume_task',
      reason: 'resume_active_task',
      taskKind: 'resume',
      risk: 'low',
      confidence: 1,
    };
  }

  if (hasActiveTask && /(当前任务|这个任务|继续修复|继续做)/i.test(prompt)) {
    return {
      action: 'resume_task',
      reason: 'resume_active_task',
      taskKind: 'resume',
      risk: 'low',
      confidence: 1,
    };
  }

  if (isQuestionOnly(prompt)) {
    return {
      action: 'chat',
      reason: 'matched_question_intent',
      taskKind: 'question',
      risk: 'low',
      confidence: 0.95,
    };
  }

  const taskKind = detectChangeKind(prompt);
  if (taskKind) {
    return {
      action: allowFallbackCreate ? 'create_task' : 'delegate_to_planner',
      reason: 'matched_change_intent',
      taskKind,
      risk: detectRisk(prompt, taskKind),
      confidence: 0.9,
    };
  }

  return {
    action: 'chat',
    reason: 'ambiguous_intent',
    taskKind: 'question',
    risk: 'low',
    confidence: 0.4,
  };
}

function applyLearnedDecision(
  base: IntakeDecision,
  prompt: string,
  feedbackEntries: Awaited<ReturnType<typeof loadIntakeFeedback>>,
): IntakeDecision {
  if (base.reason === 'empty_prompt' || base.reason === 'host_internal_prompt' || base.reason === 'resume_active_task') {
    return base;
  }

  const learned = classifyByIntakeFeedback(prompt, feedbackEntries);
  if (!learned) {
    return base;
  }

  return {
    action: learned.action,
    reason: learned.reason,
    taskKind: learned.action === 'chat' ? 'question' : base.taskKind,
    risk: base.risk,
    confidence: learned.confidence,
    learnedFrom: learned.matchedEntryIds,
  };
}

/**
 * 根据 action + 当前 task stage + enabled 角色，输出 stage-aware 的推荐 sub-agent。
 * 没有合适角色时返回 null（hook 文案会回退到老的 harness-planner / harness-evaluator）。
 */
async function resolveRecommendedAgent(
  workDir: string,
  action: PromptAction,
  activeStage: StageMarker | null,
): Promise<string | null> {
  if (action !== 'delegate_to_planner' && action !== 'resume_task') {
    return null;
  }

  const manifests = await loadAgentManifests(workDir);
  const enabledRoles = collectEnabledRoles(manifests);

  if (action === 'delegate_to_planner') {
    return pickRecommendedAgent('new_task', null, enabledRoles);
  }

  // action === 'resume_task'
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

  // 加载 active task 的 currentStage（如有），用于 resume_task 的角色路由
  let activeStage: StageMarker | null = null;
  if (activeTaskId) {
    try {
      const ctx = await manager.load(activeTaskId, workDir);
      activeStage = ctx.state.currentStage;
    } catch {
      // active task 文件存在但 task 工件丢失：忽略，按无 stage 处理
    }
  }

  // 自动降级：上次 Planner 委派未产生 task，本次直接 create_task
  const pending = await readPendingDelegation(workDir);
  const feedbackEntries = await loadIntakeFeedback(workDir);
  const builtinDecision = classifyPrompt(
    prompt,
    Boolean(activeTaskId),
    config.fallbackCreateTaskWithoutPlanner || (pending !== null),
  );
  const decision = applyLearnedDecision(builtinDecision, prompt, feedbackEntries);
  const { action } = decision;

  // v3-core 5 角色路由：根据 action + stage 选推荐 sub-agent
  const recommendedAgent = await resolveRecommendedAgent(workDir, action, activeStage);

  await appendHarnessEvent(workDir, {
    type: 'host.intake_decision',
    host: config.defaultHost,
    action,
    reason: decision.reason,
    taskKind: decision.taskKind,
    risk: decision.risk,
    confidence: decision.confidence,
    learnedFrom: decision.learnedFrom,
    activeTaskId,
    activeStage,
    recommendedAgent,
    taskCreated: false,
  });
  await writeLastIntakeDecision(workDir, {
    prompt,
    action,
    reason: decision.reason,
    taskKind: decision.taskKind,
    risk: decision.risk,
  });

  if (action === 'create_task') {
    await clearPendingDelegation(workDir);
    const ctx = await manager.create(prompt, workDir);
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
      contractPath: `${ctx.taskDir}/contract.yaml`,
      planPath: `${ctx.taskDir}/plan.md`,
    });

    printJson({
      prompt,
      activeTaskId: ctx.taskId,
      activeStage: ctx.state.currentStage,
      action,
      reason: decision.reason,
      taskKind: decision.taskKind,
      risk: decision.risk,
      confidence: decision.confidence,
      learnedFrom: decision.learnedFrom,
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
    taskKind: decision.taskKind,
    risk: decision.risk,
    confidence: decision.confidence,
    learnedFrom: decision.learnedFrom,
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
