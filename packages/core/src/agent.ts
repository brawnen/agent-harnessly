import type { Dirent } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  type AgentManifest,
  type AgentRole,
  type StageMarker,
  parseAgentManifestYaml,
  serializeAgentManifestYaml,
} from '@harnessly/shared';

import { getHarnessPaths } from './scaffold';

/**
 * v3-core 5 角色固定枚举。顺序对应 SPEC §6 阶段顺序，
 * 用于 init 时的默认写入次序与 status 命令的展示顺序。
 */
export const AGENT_ROLES: readonly AgentRole[] = [
  'requirement',
  'designer',
  'developer',
  'reviewer',
  'tester',
] as const;

export interface AgentDiskFiles {
  manifestPath: string;
  promptPath: string;
}

export function getAgentDiskFiles(workDir: string, role: AgentRole): AgentDiskFiles {
  const paths = getHarnessPaths(workDir);
  return {
    manifestPath: path.join(paths.agentsDir, `${role}.yaml`),
    promptPath: path.join(paths.agentsDir, `${role}.prompt.md`),
  };
}

/**
 * 5 个角色的默认 manifest。Phase 2 第一步主要保证骨架可启动，
 * 模型与 prompt 内容仍可由用户在 .harness/agents/ 中自由覆写。
 */
const DEFAULT_AGENT_MANIFESTS: Record<AgentRole, AgentManifest> = {
  requirement: {
    role: 'requirement',
    displayName: 'Harness Requirement',
    description: '在 SPEC 阶段帮 PM 澄清需求、列举可验收点',
    stage: 'spec',
    enabled: true,
    models: {
      'claude-code': 'haiku',
      codex: 'gpt-5.4-mini',
      'gemini-cli': 'gemini-flash',
    },
    toolWhitelist: ['Read', 'Bash'],
    prompt: [
      '# Harness Requirement Agent',
      '',
      '你是 Harnessly Requirement。你的职责是把用户目标转成结构化的需求规格。',
      '',
      '## 工作原则',
      '- 你不是设计者，也不是实现者，不要列实施步骤、不要写代码。',
      '- 第一步：调用 `harnessly host agent-event --agent requirement --event started`',
      '- 输出必须落到 `.harness/tasks/<task-id>/contract.yaml`，包含 goal、scope、acceptance、out_of_scope。',
      '- 不清楚的需求先回问主 Agent，不要替用户编造范围。',
      '',
      '## 完成标准',
      '- contract.yaml 已生成或定位',
      '- 已把关键约束摘要回传给主 Agent',
      '',
    ].join('\n'),
  },

  designer: {
    role: 'designer',
    displayName: 'Harness Designer',
    description: '在 DESIGN 阶段基于 contract 列实施步骤、依赖与风险',
    stage: 'design',
    enabled: true,
    models: {
      'claude-code': 'sonnet',
      codex: 'gpt-5.4',
      'gemini-cli': 'gemini-pro',
    },
    toolWhitelist: ['Read', 'Bash', 'Glob', 'Grep'],
    prompt: [
      '# Harness Designer Agent',
      '',
      '你是 Harnessly Designer。你的职责是把 contract 转成可执行的实施计划。',
      '',
      '## 工作原则',
      '- 第一步：调用 `harnessly host agent-event --agent designer --event started`',
      '- 输入是 `.harness/tasks/<task-id>/contract.yaml`，输出是 `plan.md`。',
      '- plan 必须列：步骤、涉及文件、依赖关系、关键风险、验证手段。',
      '- 不要在 design 阶段直接改代码。',
      '',
      '## 完成标准',
      '- plan.md 已生成或定位',
      '- 主 Agent 拿到 plan 即可进入 EXECUTE 阶段',
      '',
    ].join('\n'),
  },

  developer: {
    role: 'developer',
    displayName: 'Harness Developer',
    description: '在 EXECUTE 阶段按 plan 执行（headless 适配；主路径下由主 agent 担任）',
    stage: 'execute',
    enabled: false,
    models: {
      'claude-code': 'sonnet',
      codex: 'gpt-5.4',
      'gemini-cli': 'gemini-pro',
    },
    toolWhitelist: ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'],
    prompt: [
      '# Harness Developer Agent',
      '',
      '你是 Harnessly Developer。在 headless 模式或子任务沙箱中按 plan 实施改动。',
      '主路径（host 模式）下，这个角色由宿主主 Agent 自己担任，sub-agent 默认不启用。',
      '',
      '## 工作原则',
      '- 第一步：调用 `harnessly host agent-event --agent developer --event started`',
      '- 严格按 plan.md 执行，不修改 contract.yaml / plan.md。',
      '- plan 在执行中被证伪时停下，不绕过。',
      '- 只在 contract.scopeInclude 范围内修改文件。',
      '',
      '## 完成标准',
      '- plan 中的所有步骤都有产出或显式标记跳过原因',
      '- 工作区有可验证的代码改动',
      '',
    ].join('\n'),
  },

  reviewer: {
    role: 'reviewer',
    displayName: 'Harness Reviewer',
    description: '在 REVIEW 阶段对改动做语义层审查（scope、敏感文件、副作用）',
    stage: 'review',
    enabled: true,
    models: {
      'claude-code': 'sonnet',
      codex: 'gpt-5.4',
      'gemini-cli': 'gemini-pro',
    },
    toolWhitelist: ['Read', 'Bash', 'Glob', 'Grep'],
    prompt: [
      '# Harness Reviewer Agent',
      '',
      '你是 Harnessly Reviewer。你的职责是审视改动是否合规、是否引入新风险。',
      '',
      '## 工作原则',
      '- 第一步：调用 `harnessly host agent-event --agent reviewer --event started`',
      '- 只读、不动代码。',
      '- 关注：scope 越界、敏感文件、改动规模、潜在副作用、与 plan 的偏离。',
      '- findings 写到 `.harness/tasks/<task-id>/review.json`（结构化数组）。',
      '',
      '## 完成标准',
      '- review.json 已生成（即便没有 findings 也要写空数组并标注）',
      '- 给出 PASS / FAIL 裁决',
      '',
    ].join('\n'),
  },

  tester: {
    role: 'tester',
    displayName: 'Harness Tester',
    description: '在 TEST 阶段跑 required checks 与 acceptance 校验',
    stage: 'test',
    enabled: true,
    models: {
      'claude-code': 'sonnet',
      codex: 'gpt-5.4',
      'gemini-cli': 'gemini-pro',
    },
    toolWhitelist: ['Read', 'Bash'],
    prompt: [
      '# Harness Tester Agent',
      '',
      '你是 Harnessly Tester。你的职责是跑配置中的 required checks 与 contract 的 acceptance 校验。',
      '',
      '## 工作原则',
      '- 第一步：调用 `harnessly host agent-event --agent tester --event started`',
      '- 不改代码。',
      '- 跑命令、收集 evidence、汇总。',
      '- evidence 写到 `.harness/tasks/<task-id>/report.json` 的 evidence 段。',
      '',
      '## 完成标准',
      '- 所有 required checks 都有结果（passed / failed / skipped）',
      '- 给出 PASS / FAIL 裁决',
      '',
    ].join('\n'),
  },
};

export function getDefaultAgentManifest(role: AgentRole): AgentManifest {
  // 返回深拷贝，避免调用方修改默认值
  const source = DEFAULT_AGENT_MANIFESTS[role];
  return {
    ...source,
    models: { ...source.models },
    toolWhitelist: [...source.toolWhitelist],
  };
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT'
  );
}

async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }
    throw error;
  }
}

/**
 * 读取单个 agent 的磁盘定义。
 * 缺 yaml 视为未启用（返回 null）；缺 prompt.md 用空串兜底，避免 host 渲染崩溃。
 */
export async function loadAgentManifest(
  workDir: string,
  role: AgentRole,
): Promise<AgentManifest | null> {
  const { manifestPath, promptPath } = getAgentDiskFiles(workDir, role);
  const yamlText = await readFileIfExists(manifestPath);

  if (yamlText === null) {
    return null;
  }

  const manifest = parseAgentManifestYaml(yamlText);
  const promptText = (await readFileIfExists(promptPath)) ?? '';

  return {
    ...manifest,
    prompt: promptText,
  };
}

/**
 * 加载 .harness/agents/ 下所有已知角色的 manifest。
 * 未在磁盘上的角色不会出现在结果里；调用方需自行处理缺失情况。
 *
 * 返回顺序与 AGENT_ROLES 一致，便于稳定渲染。
 */
export async function loadAgentManifests(workDir: string): Promise<AgentManifest[]> {
  const manifests: AgentManifest[] = [];

  for (const role of AGENT_ROLES) {
    const manifest = await loadAgentManifest(workDir, role);
    if (manifest) {
      manifests.push(manifest);
    }
  }

  return manifests;
}

/**
 * 列出磁盘上 agents 目录里的所有 yaml 文件名（含未在 AGENT_ROLES 里的自定义文件），
 * 用于 status / debug 场景。
 */
export async function listAgentFiles(workDir: string): Promise<string[]> {
  const paths = getHarnessPaths(workDir);
  let entries: Dirent[];

  try {
    entries = await readdir(paths.agentsDir, { withFileTypes: true });
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }
    throw error;
  }

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

export interface AgentWriteResult {
  role: AgentRole;
  manifestStatus: 'created' | 'updated' | 'skipped';
  promptStatus: 'created' | 'updated' | 'skipped';
}

async function writeIfMissingOrForced(
  filePath: string,
  content: string,
  force: boolean,
): Promise<'created' | 'updated' | 'skipped'> {
  const existing = await readFileIfExists(filePath);
  if (existing === null) {
    await writeFile(filePath, content, 'utf8');
    return 'created';
  }

  if (existing === content) {
    return 'skipped';
  }

  if (!force) {
    return 'skipped';
  }

  await writeFile(filePath, content, 'utf8');
  return 'updated';
}

/**
 * 把 5 个默认 manifest 写入 .harness/agents/。
 * - 已存在且与默认值一致：skipped
 * - 已存在但不同：force=false 时 skipped（保护用户改动），force=true 时 updated
 * - 不存在：created
 */
/**
 * v3-core 的角色路由意图，用于 hook / CLI 决定推荐哪一个 sub-agent。
 *
 * - 'new_task'         : 新任务入口，倾向 spec 阶段 → harness-requirement
 * - 'resume_task'      : 续接 active task，按当前 stage 路由
 * - 'completion_review': 任务完成时复查，按 lastFailureStage / currentStage 路由
 */
export type AgentRoutingIntent = 'new_task' | 'resume_task' | 'completion_review';

const STAGE_TO_ROLE: Partial<Record<StageMarker, AgentRole>> = {
  spec: 'requirement',
  design: 'designer',
  review: 'reviewer',
  test: 'tester',
  // execute 阶段由主 agent 担任，不在此映射
  // commit_gate / created / failed / retry 没有专属角色，由 fallback 处理
};

/**
 * 从 stage 推断对应的 v3-core 角色（不考虑是否启用）。
 * 用于诊断与文档；调用方需自行判断 enabledRoles。
 */
export function getRoleForStage(stage: StageMarker): AgentRole | null {
  return STAGE_TO_ROLE[stage] ?? null;
}

/**
 * 按路由意图 + 当前 stage + 启用角色集合，挑出推荐的 sub-agent 名字。
 *
 * 规则：
 * - new_task         : 启用了 requirement 用 'harness-requirement'，否则用复合别名 'harness-planner'
 * - resume_task      : stage 对应角色已启用就用 'harness-<role>'；execute 阶段返回 null（主 agent）；其他情况返回 null
 * - completion_review: stage 对应角色已启用就用 'harness-<role>'；否则用复合别名 'harness-evaluator'
 *
 * 'harness-planner' / 'harness-evaluator' 是 v2 复合别名，host install 始终生成；
 * 'harness-<role>' 仅在用户启用了对应 manifest 时存在。
 */
export function pickRecommendedAgent(
  intent: AgentRoutingIntent,
  stage: StageMarker | null,
  enabledRoles: ReadonlySet<AgentRole>,
): string | null {
  if (intent === 'new_task') {
    return enabledRoles.has('requirement') ? 'harness-requirement' : 'harness-planner';
  }

  if (intent === 'resume_task') {
    if (!stage) {
      return null;
    }

    if (stage === 'execute') {
      // execute 阶段由宿主主 agent 担任，不切到 sub-agent
      return null;
    }

    const role = STAGE_TO_ROLE[stage];
    if (role && enabledRoles.has(role)) {
      return `harness-${role}`;
    }

    return null;
  }

  // intent === 'completion_review'
  if (stage) {
    const role = STAGE_TO_ROLE[stage];
    if (role && enabledRoles.has(role)) {
      return `harness-${role}`;
    }
  }

  return 'harness-evaluator';
}

/**
 * 从 manifests 列表收集 enabled=true 的角色集合，便于 pickRecommendedAgent 消费。
 */
export function collectEnabledRoles(manifests: readonly AgentManifest[]): Set<AgentRole> {
  const result = new Set<AgentRole>();
  for (const m of manifests) {
    if (m.enabled) {
      result.add(m.role);
    }
  }
  return result;
}

export async function writeDefaultAgentManifests(
  workDir: string,
  force = false,
): Promise<AgentWriteResult[]> {
  const results: AgentWriteResult[] = [];

  for (const role of AGENT_ROLES) {
    const manifest = getDefaultAgentManifest(role);
    const { manifestPath, promptPath } = getAgentDiskFiles(workDir, role);

    const manifestStatus = await writeIfMissingOrForced(
      manifestPath,
      serializeAgentManifestYaml(manifest),
      force,
    );
    const promptStatus = await writeIfMissingOrForced(promptPath, manifest.prompt, force);

    results.push({ role, manifestStatus, promptStatus });
  }

  return results;
}
