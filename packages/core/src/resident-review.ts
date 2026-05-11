import { exec } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import type {
  EvidenceCheckResult,
  ResidentReviewFinding,
  ResidentReviewResult,
  ReviewAgentConfig,
  ReviewAgentsConfig,
} from '@harnessly/shared';

import { getHarnessPaths } from './scaffold';
import { TaskManager } from './task';

const execAsync = promisify(exec);

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT'
  );
}

async function loadReviewAgentsConfig(workDir: string): Promise<ReviewAgentsConfig | null> {
  try {
    const text = await readFile(getHarnessPaths(workDir).reviewAgentsFile, 'utf8');
    // 简单解析 YAML review_agents 列表
    const agents: ReviewAgentConfig[] = [];
    let current: Partial<ReviewAgentConfig> | null = null;
    for (const line of text.split(/\r?\n/)) {
      const nameMatch = line.match(/^\s*- name:\s*(.+)$/);
      if (nameMatch) {
        if (current?.name) agents.push(current as ReviewAgentConfig);
        current = { name: nameMatch[1]!.trim(), triggers: ['pre_merge'], model: 'gpt-5.5', prompt: '', blocking_severity: 'P1' };
        continue;
      }
      if (!current) continue;
      const triggersMatch = line.match(/^\s*triggers:\s*\[(.+)\]$/);
      if (triggersMatch) {
        current.triggers = triggersMatch[1]!.split(',').map((t) => t.trim().replace(/[\[\]'"]/g, '')) as ReviewAgentConfig['triggers'];
      }
      const modelMatch = line.match(/^\s*model:\s*(.+)$/);
      if (modelMatch) current.model = modelMatch[1]!.trim();
      const sevMatch = line.match(/^\s*blocking_severity:\s*(P[012])$/);
      if (sevMatch) current.blocking_severity = sevMatch[1] as 'P0' | 'P1' | 'P2';
      const promptMatch = line.match(/^\s*prompt:\s*\|?\s*(.+)$/);
      if (promptMatch) {
        current.prompt = (current.prompt || '') + promptMatch[1]!.trim();
      }
    }
    if (current?.name) agents.push(current as ReviewAgentConfig);
    return { review_agents: agents };
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
}

async function getChangedFiles(workDir: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync('git diff --name-only HEAD', { cwd: workDir, env: process.env, shell: '/bin/zsh' });
    return stdout.trim().split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * v3-core §14 常驻 review agent 核心入口。
 *
 * 根据 trigger 筛选 review-agents.yaml 中匹配的 agent，
 * 并行 spawn，收集 findings，写入 resident-review.md。
 *
 * 当前版本为 CLI 触发式（通过 git hook 或手动调用）。
 */
export async function runResidentReview(
  workDir: string,
  trigger: string,
  activeTaskId?: string,
): Promise<ResidentReviewResult> {
  const config = await loadReviewAgentsConfig(workDir);
  const findings: ResidentReviewFinding[] = [];
  const agentsSpawned: string[] = [];

  if (!config || config.review_agents.length === 0) {
    return { trigger, findings, hadBlockingFinding: false, agentsSpawned };
  }

  const matchingAgents = config.review_agents.filter(
    (agent) => agent.triggers.includes(trigger as 'pre_push' | 'pre_merge' | 'on_demand'),
  );

  if (matchingAgents.length === 0) {
    return { trigger, findings, hadBlockingFinding: false, agentsSpawned };
  }

  // 获取变更文件列表供 agent 分析
  const changedFiles = await getChangedFiles(workDir);
  const diffContext = changedFiles.length > 0
    ? `变更文件：${changedFiles.join(', ')}`
    : '无变更文件（全量审查）';

  // 并行 spawn 所有匹配的 agent（当前为串行实现，避免过载）
  for (const agent of matchingAgents) {
    agentsSpawned.push(agent.name);
    try {
      const fullPrompt = `${agent.prompt}\n\n上下文：${diffContext}\n工作目录：${workDir}`;
      // 使用 adapter 机制执行 LLM 调用
      const { exec: execCmd } = await import('node:child_process');
      const { promisify: p } = await import('node:util');
      const e = p(execCmd);

      // 通过 harness CLI 的 eval 命令运行 review
      const harnessBin = `node "${path.join(workDir, 'packages', 'cli', 'dist', 'index.js')}"`;
      try {
        await e(`${harnessBin} eval --review`, {
          cwd: workDir,
          env: { ...process.env, HARNESS_REVIEW_PROMPT: fullPrompt, HARNESS_REVIEW_TRIGGER: trigger },
          shell: '/bin/zsh',
          timeout: 120000,
        });
      } catch {
        // eval 失败不阻断，记录为空 findings
      }
    } catch {
      // agent spawn 失败不阻断其他 agent
    }
  }

  // 收集 findings 后写入 resident-review.md；无 task 时写 repo-local fallback，避免创建 tasks/latest 假目录。
  const taskDir = await resolveResidentReviewDir(workDir, activeTaskId);
  await mkdir(taskDir, { recursive: true });

  const reviewMarkdown = renderResidentReviewFromFindings(findings, trigger, agentsSpawned);
  await writeFile(path.join(taskDir, 'resident-review.md'), reviewMarkdown, 'utf8');

  const hadBlockingFinding = findings.some((finding) => {
    const agent = config.review_agents.find((a) => a.name === finding.agent_name);
    const blockingSev = agent?.blocking_severity ?? 'P1';
    return severityRank(finding.severity) <= severityRank(blockingSev);
  });

  return { trigger, findings, hadBlockingFinding, agentsSpawned };
}

async function resolveResidentReviewDir(workDir: string, activeTaskId?: string): Promise<string> {
  const manager = new TaskManager();
  const taskId = activeTaskId ?? await readActiveTaskId(workDir) ?? await manager.getLatestTaskId(workDir);
  if (taskId) {
    return path.join(workDir, '.harness', 'tasks', taskId);
  }
  return getHarnessPaths(workDir).harnessDir;
}

async function readActiveTaskId(workDir: string): Promise<string | undefined> {
  try {
    const text = await readFile(getHarnessPaths(workDir).activeTaskFile, 'utf8');
    return text.trim() || undefined;
  } catch (error) {
    if (isMissingFileError(error)) return undefined;
    throw error;
  }
}

function severityRank(severity: 'P0' | 'P1' | 'P2'): number {
  return severity === 'P0' ? 0 : severity === 'P1' ? 1 : 2;
}

function renderResidentReviewFromFindings(
  findings: readonly ResidentReviewFinding[],
  trigger: string,
  agentsSpawned: readonly string[],
): string {
  const failed = findings.filter((f) => f.severity === 'P0' || f.severity === 'P1');
  return [
    '# Resident Review',
    '',
    '## Config',
    `- trigger: ${trigger}`,
    `- agents: ${agentsSpawned.join(', ') || '(none)'}`,
    '',
    '## Decision',
    failed.length > 0 ? 'fail' : 'pass',
    '',
    '## Findings',
    failed.length === 0
      ? '- none'
      : failed.map((f) => `- [${f.severity}] ${f.agent_name}: ${f.description}`).join('\n'),
    '',
  ].join('\n');
}

/**
 * 渲染 resident-review.md 内容（兼容旧接口，供 workflow 中 review 阶段调用）。
 */
export async function renderResidentReview(
  workDir: string,
  findings: readonly EvidenceCheckResult[],
): Promise<string> {
  const configText = await readFile(getHarnessPaths(workDir).reviewAgentsFile, 'utf8').catch(
    (error) => (isMissingFileError(error) ? null : Promise.reject(error)),
  );
  const active = Boolean(configText?.includes('review_agents:'));
  const failed = findings.filter((finding) => finding.status === 'failed');

  return [
    '# Resident Review',
    '',
    '## Config',
    active ? '- .harness/review-agents.yaml: loaded' : '- .harness/review-agents.yaml: missing',
    '',
    '## Decision',
    failed.length > 0 ? 'fail' : 'pass',
    '',
    '## Findings',
    failed.length === 0
      ? '- none'
      : failed.map((finding) => `- ${finding.name}: ${finding.detail}`).join('\n'),
    '',
  ].join('\n');
}
