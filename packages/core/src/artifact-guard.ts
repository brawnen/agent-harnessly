import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { EvidenceCheckResult } from '@harnessly/shared';

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT'
  );
}

const REQUIRED_TASK_ARTIFACTS = [
  'requirement.md',
  'contract.yaml',
  'design.md',
  'task-breakdown.md',
  'implementation-notes.md',
  'review.md',
  'resident-review.md',
  'test-report.md',
  'evidence/current.json',
] as const;

export async function runArtifactGuard(taskDir: string): Promise<EvidenceCheckResult> {
  const missing: string[] = [];
  for (const relative of REQUIRED_TASK_ARTIFACTS) {
    if (!(await exists(path.join(taskDir, relative)))) {
      missing.push(relative);
    }
  }

  return {
    name: 'artifact.guard',
    status: missing.length === 0 ? 'passed' : 'failed',
    command: 'check .harness task artifacts',
    detail: missing.length === 0 ? '任务物理工件完整' : `缺少任务物理工件：${missing.join(', ')}`,
    fixHint: missing.length === 0 ? undefined : '回到对应阶段生成缺失工件，不要只依赖对话文本',
  };
}

/**
 * v3-core §10 纪律 1 物理强制执行：工件 → 所属阶段的映射。
 * 每个工件只有其 owner 阶段可写；其他阶段写入即被 PreToolUse hook 拦截。
 */
const ARTIFACT_OWNERSHIP: Readonly<Record<string, string>> = {
  'requirement.md': 'spec',
  'contract.yaml': 'spec',
  'design.md': 'design',
  'task-breakdown.md': 'design',
  'plan.md': 'design',
  'implementation-notes.md': 'execute',
  'review.md': 'review',
  'resident-review.md': 'review',
  'test-report.md': 'test',
  'evidence/baseline.json': 'test',
  'evidence/current.json': 'test',
  'evidence/baseline-diff.json': 'test',
  'commit-summary.md': 'commit_gate',
  'report.json': 'commit_gate',
};

/** 系统命令可写的路径前缀；宿主 PreToolUse 触发时一律拦截，CLI 系统命令不会经过该 hook。 */
const SYSTEM_PATHS = ['docs/architecture/'];

export interface WriteCheckResult {
  allowed: boolean;
  reason: string;
  file: string;
  currentStage?: string;
  requiredStage?: string;
}

/**
 * 检查当前是否有权写入指定文件路径。
 *
 * 规则（SPEC §10）：
 * - `docs/architecture/` 路径仅系统命令可写 → 拒绝
 * - `.harness/tasks/<id>/<artifact>` 匹配 → 读 state.json 对比 currentStage
 * - 非任务工件路径 → 放行
 */
export async function checkWritePermission(
  workDir: string,
  filePath: string,
  activeTaskId?: string,
): Promise<WriteCheckResult> {
  // 解析相对于 workDir 的路径
  const relative = filePath.startsWith(workDir)
    ? filePath.slice(workDir.length).replace(/^\//, '')
    : filePath;

  // 系统级路径保护：docs/architecture/ 仅系统命令可写
  for (const sysPath of SYSTEM_PATHS) {
    if (relative.startsWith(sysPath)) {
      return {
        allowed: false,
        reason: `路径 ${sysPath} 仅 harnessly 系统命令可写（harness archive promote），sub-agent 禁止直接写入`,
        file: relative,
      };
    }
  }

  // 匹配任务工件路径：.harness/tasks/<taskId>/<artifact>
  const taskMatch = relative.match(/^\.harness\/tasks\/([^/]+)\/(.+)$/);
  if (!taskMatch) {
    return { allowed: true, reason: '非任务工件路径，放行', file: relative };
  }

  const [, taskId, artifactName] = taskMatch;
  const resolvedActiveTaskId = activeTaskId ?? await readActiveTaskId(workDir);

  // 查找工件所属阶段
  const requiredStage = ARTIFACT_OWNERSHIP[artifactName];
  if (!requiredStage) {
    // 不在映射表内（如 prompt.md、feedback.md）→ 放行
    return { allowed: true, reason: `工件 ${artifactName} 不在所有权映射中，放行`, file: relative };
  }

  // 读取 state.json 获取当前阶段
  const stateFile = path.join(workDir, '.harness', 'tasks', taskId, 'state.json');
  let currentStage: string | undefined;
  try {
    const stateText = await readFile(stateFile, 'utf8');
    const state = JSON.parse(stateText) as { currentStage?: string };
    currentStage = state.currentStage;
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
    // state.json 不存在 → 无法判断，放行（避免阻断首次初始化流程）
    return { allowed: true, reason: 'state.json 不存在，放行', file: relative };
  }

  // 兜底：任务未指定阶段放行
  if (!currentStage || resolvedActiveTaskId !== taskId) {
    return { allowed: true, reason: '任务未指定 currentStage 或不是当前 active task', file: relative };
  }

  if (currentStage === requiredStage) {
    return { allowed: true, reason: `当前阶段 ${currentStage} 匹配工件 ${artifactName}`, file: relative, currentStage, requiredStage };
  }

  return {
    allowed: false,
    reason: `当前阶段 ${currentStage} 无权写入 ${artifactName}（所属阶段：${requiredStage}）。SPEC §10 纪律 1：下游不得修改上游工件`,
    file: relative,
    currentStage,
    requiredStage,
  };
}

async function readActiveTaskId(workDir: string): Promise<string | undefined> {
  try {
    const text = await readFile(path.join(workDir, '.harness', 'active-task.txt'), 'utf8');
    return text.trim() || undefined;
  } catch (error) {
    if (isMissingFileError(error)) return undefined;
    throw error;
  }
}
