import { loadHarnessConfig, TaskManager, WorkflowEngine } from '@harnessly/core';

import { appendHarnessEvent } from '../../utils/events';
import { readActiveTaskId } from '../../utils/hosts';
import { printJson } from '../../utils/output';

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
    | 'default_change_intent';
  taskKind: TaskKind;
  risk: IntakeRisk;
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
    };
  }

  if (isHostInternalPrompt(prompt)) {
    return {
      action: 'chat',
      reason: 'host_internal_prompt',
      taskKind: 'host_internal',
      risk: 'low',
    };
  }

  if (hasActiveTask && /(继续|resume|接着|延续)/i.test(prompt)) {
    return {
      action: 'resume_task',
      reason: 'resume_active_task',
      taskKind: 'resume',
      risk: 'low',
    };
  }

  if (hasActiveTask && /(当前任务|这个任务|继续修复|继续做)/i.test(prompt)) {
    return {
      action: 'resume_task',
      reason: 'resume_active_task',
      taskKind: 'resume',
      risk: 'low',
    };
  }

  if (isQuestionOnly(prompt)) {
    return {
      action: 'chat',
      reason: 'matched_question_intent',
      taskKind: 'question',
      risk: 'low',
    };
  }

  const taskKind = detectChangeKind(prompt);
  if (taskKind) {
    return {
      action: allowFallbackCreate ? 'create_task' : 'delegate_to_planner',
      reason: 'matched_change_intent',
      taskKind,
      risk: detectRisk(prompt, taskKind),
    };
  }

  return {
    action: allowFallbackCreate ? 'create_task' : 'delegate_to_planner',
    reason: 'default_change_intent',
    taskKind: 'code_change',
    risk: 'low',
  };
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
  const decision = classifyPrompt(
    prompt,
    Boolean(activeTaskId),
    config.fallbackCreateTaskWithoutPlanner,
  );
  const { action } = decision;

  await appendHarnessEvent(workDir, {
    type: 'host.intake_decision',
    host: config.defaultHost,
    action,
    reason: decision.reason,
    taskKind: decision.taskKind,
    risk: decision.risk,
    activeTaskId,
    plannerAgent: action === 'delegate_to_planner' ? 'harness-planner' : undefined,
    taskCreated: false,
  });

  if (action === 'create_task') {
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
      action,
      reason: decision.reason,
      taskKind: decision.taskKind,
      risk: decision.risk,
      taskCreated: true,
      taskId: ctx.taskId,
      contractPath: `${ctx.taskDir}/contract.yaml`,
      planPath: `${ctx.taskDir}/plan.md`,
      nextStep: 'review_contract_and_plan',
    });
    return;
  }

  printJson({
    prompt,
    activeTaskId,
    action,
    reason: decision.reason,
    taskKind: decision.taskKind,
    risk: decision.risk,
    taskCreated: false,
    plannerAgent: action === 'delegate_to_planner' ? 'harness-planner' : undefined,
    fallbackCreateTaskWithoutPlanner: config.fallbackCreateTaskWithoutPlanner,
    nextStep:
      action === 'resume_task'
        ? 'resume_existing_task'
        : action === 'delegate_to_planner'
          ? 'delegate_to_planner'
          : 'no_action',
  });
}
