import { contractSchema, type Contract, type ContractGateResult, type TemplateName, validateContract } from '@brawnen/harnessly-shared';

import type { LLMClient } from './llm';
import { createTemplateRegistry } from './template';

export interface ContractGenerationOptions {
  taskId?: string;
  goal: string;
  templateName: TemplateName;
  llmClient?: LLMClient | null;
}

export function generateFallbackContract(
  goal: string,
  templateName: TemplateName,
  taskId = '',
): Contract {
  const template = createTemplateRegistry().get(templateName);

  return {
    version: '2.0',
    taskId,
    goal,
    templateName,
    riskLevel: template.defaultRiskLevel,
    estimatedComplexity: template.defaultRiskLevel === 'low' ? 'simple' : 'medium',
    requiredChecks: [],
    scopeInclude: [...template.defaultScopeInclude],
    scopeExclude: [...template.defaultScopeExclude],
    acceptanceCriteria: [
      { criterion: `目标“${goal}”已被实现或修复`, verifiableBy: 'manual' as const },
      ...template.defaultAcceptanceCriteria.slice(1),
    ].map((item) =>
      typeof item === 'string' ? { criterion: item, verifiableBy: 'manual' as const } : item,
    ),
    outOfScope: [...template.defaultOutOfScope],
    linkedSpec: 'requirement.md',
    linkedDesign: 'design.md',
    createdAt: new Date().toISOString(),
  };
}

function createContractSystemPrompt(): string {
  return [
    '你是 Harnessly 的 contract planner。',
    '你的任务是基于用户目标输出一个可验证、可执行、范围最小的 contract。',
    '不要扩展用户未请求的目标，不要做平台化重构，不要引入无关依赖。',
    'scopeInclude 要写实际修改范围，outOfScope 要明确排除大范围重构和无关模块。',
    'acceptanceCriteria 必须可验证，且适合作为后续 verify 输入。',
  ].join('\n');
}

function createContractPrompt(goal: string, templateName: TemplateName, fallback: Contract): string {
  return [
    `目标：${goal}`,
    `模板：${templateName}`,
    '',
    '请输出满足 schema 的 contract。',
    '要求：',
    '- goal 保持与用户目标一致',
    '- templateName 保持与给定模板一致',
    '- riskLevel 基于改动风险判断',
    '- scopeInclude 使用具体修改范围，不要写空话',
    '- acceptanceCriteria 至少 3 条，且要可验证',
    '- 尽量让 criterion 用以下结构化前缀，使其可被自动校验（无法结构化时才退回自然语言）：',
    '  - `file:<相对路径>`：断言文件存在',
    '  - `contains:<相对路径>::<文本>`：断言文件包含指定文本',
    '  - `command:<命令>`：断言该命令以退出码 0 通过（如 `command:pnpm test`）',
    '  - 结构化条目的 verifiableBy 应与手段一致（file/contains/command 类用 test 或 build，纯人工判断才用 manual）',
    '- outOfScope 明确列出不做的事情',
    '',
    `可参考的保底 contract：${JSON.stringify(fallback, null, 2)}`,
  ].join('\n');
}

export async function generateContract(options: ContractGenerationOptions): Promise<Contract> {
  const fallback = generateFallbackContract(options.goal, options.templateName, options.taskId);

  if (!options.llmClient) {
    return fallback;
  }

  try {
    const generated = await options.llmClient.generateStructured({
      prompt: createContractPrompt(options.goal, options.templateName, fallback),
      systemPrompt: createContractSystemPrompt(),
      schema: contractSchema,
      toolName: 'emit_contract',
      toolDescription: '输出 Harnessly contract',
    });

    return validateContract({
      ...fallback,
      ...generated,
      version: '2.0',
      taskId: options.taskId ?? '',
      goal: options.goal,
      templateName: options.templateName,
      linkedSpec: 'requirement.md',
      linkedDesign: 'design.md',
      createdAt: new Date().toISOString(),
    });
  } catch {
    return fallback;
  }
}

export function checkContract(contract: Contract): ContractGateResult {
  const failures: string[] = [];

  if (!contract.goal.trim()) {
    failures.push('goal 不能为空');
  }

  if (!contract.templateName) {
    failures.push('template_name 缺失');
  }

  if (contract.version !== '2.0') {
    failures.push('version 必须为 2.0');
  }

  if (contract.scopeInclude.length === 0) {
    failures.push('scope_include 不能为空');
  }

  if (contract.acceptanceCriteria.length === 0) {
    failures.push('acceptance_criteria 不能为空');
  }

  if (contract.outOfScope.length === 0) {
    failures.push('out_of_scope 不能为空');
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}
