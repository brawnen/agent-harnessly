import { access, mkdir, readFile } from 'node:fs/promises';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

import {
  parseFlatYaml,
  parseStringList,
  skillSchema,
  type EvidenceCheckResult,
  type ProjectType,
  type RequiredCheck,
  type Skill,
} from '@harnessly/shared';

import { getHarnessPaths, writeFileIfChanged } from './scaffold';

const execAsync = promisify(exec);

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT'
  );
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (isMissingFileError(error)) return false;
    throw error;
  }
}

export function getSkillPath(workDir: string, checkName: RequiredCheck, language: ProjectType): string {
  return path.join(getHarnessPaths(workDir).harnessDir, 'skills', checkName, `${language}.yaml`);
}

export async function loadSkill(
  workDir: string,
  checkName: RequiredCheck,
  language: ProjectType,
): Promise<Skill | null> {
  const filePath = getSkillPath(workDir, checkName, language);
  if (!(await fileExists(filePath))) {
    return null;
  }

  const raw = parseFlatYaml(await readFile(filePath, 'utf8'));
  return skillSchema.parse({
    name: raw.name ?? checkName,
    language: raw.language ?? language,
    command: raw.command ?? '',
    successExitCode: Number(raw.success_exit_code ?? '0'),
    envRequired: parseStringList(raw.env_required),
    detailOnPass: raw.detail_on_pass ?? `${checkName} 通过`,
    detailOnFailTemplate: raw.detail_on_fail_template ?? `${checkName} 失败`,
    fixHintTemplate: raw.fix_hint_template ?? `修复 ${checkName} 失败后重跑`,
  });
}

export function renderSkillTemplate(checkName: RequiredCheck, language: ProjectType, command: string): string {
  return [
    `name: ${checkName}`,
    `language: ${language}`,
    `command: ${command}`,
    'success_exit_code: 0',
    'env_required:',
    `detail_on_pass: ${checkName} 通过`,
    `detail_on_fail_template: ${checkName} 失败：{stderr}`,
    `fix_hint_template: 修复 ${checkName} 失败后重跑命令：${command}`,
    '',
  ].join('\n');
}

export interface SkillWriteResult {
  check: RequiredCheck;
  language: ProjectType;
  status: 'created' | 'updated' | 'skipped';
}

const DEFAULT_NODE_SKILL_COMMANDS: Partial<Record<RequiredCheck, string>> = {
  build: 'npm run build',
  lint: 'npm run lint',
  typecheck: 'npm run typecheck',
  test: 'npm test',
};

export async function writeDefaultSkillManifests(
  workDir: string,
  language: ProjectType,
  requiredChecks: readonly RequiredCheck[],
  force = false,
): Promise<SkillWriteResult[]> {
  const results: SkillWriteResult[] = [];
  if (language !== 'node') {
    return results;
  }

  for (const check of requiredChecks) {
    const command = DEFAULT_NODE_SKILL_COMMANDS[check];
    if (!command) continue;

    const skillPath = getSkillPath(workDir, check, language);
    await mkdir(path.dirname(skillPath), { recursive: true });
    const status = await writeFileIfChanged(skillPath, renderSkillTemplate(check, language, command), force);
    results.push({ check, language, status });
  }

  return results;
}

export async function runSkillCheck(
  workDir: string,
  checkName: RequiredCheck,
  language: ProjectType,
): Promise<EvidenceCheckResult> {
  const started = Date.now();
  const skill = await loadSkill(workDir, checkName, language);
  const skillPath = getSkillPath(workDir, checkName, language);

  if (!skill) {
    return {
      name: checkName,
      status: 'skipped',
      command: `(missing skill) ${skillPath}`,
      detail: `.harness/skills/${checkName}/${language}.yaml 未配置`,
      fixHint: `运行 harnessly init 或创建 ${skillPath}`,
      durationMs: Date.now() - started,
    };
  }

  const missingEnv = skill.envRequired.filter((name) => !process.env[name]);
  if (missingEnv.length > 0) {
    return {
      name: checkName,
      status: 'skipped',
      command: skill.command,
      detail: `缺少环境变量：${missingEnv.join(', ')}`,
      fixHint: `配置环境变量后重跑：${missingEnv.join(', ')}`,
      durationMs: Date.now() - started,
    };
  }

  try {
    await execAsync(skill.command, {
      cwd: workDir,
      env: process.env,
      shell: '/bin/zsh',
    });

    return {
      name: checkName,
      status: 'passed',
      command: skill.command,
      detail: skill.detailOnPass,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    const execError = error as { code?: number; stdout?: string; stderr?: string };
    const code = typeof execError.code === 'number' ? execError.code : 1;
    if (code === skill.successExitCode) {
      return {
        name: checkName,
        status: 'passed',
        command: skill.command,
        detail: skill.detailOnPass,
        durationMs: Date.now() - started,
      };
    }

    const stderr = execError.stderr?.trim() || execError.stdout?.trim() || '命令执行失败';
    return {
      name: checkName,
      status: 'failed',
      command: skill.command,
      detail: skill.detailOnFailTemplate.replace('{stderr}', stderr),
      fixHint: skill.fixHintTemplate,
      durationMs: Date.now() - started,
    };
  }
}
