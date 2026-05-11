import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Contract, HarnessConfig, TaskReport, TemplateDraft } from '@harnessly/shared';
import { serializeTemplateDraft } from '@harnessly/shared';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'template';
}

function extractAppliesTo(goal: string, templateName: string): string[] {
  return [templateName, ...goal.split(/\s+/).filter(Boolean).slice(0, 3)];
}

export function createTemplateDraft(
  name: string,
  contract: Contract,
  report: TaskReport,
  config: HarnessConfig,
): TemplateDraft {
  return {
    name,
    description: contract.goal,
    sourceTaskId: report.taskId,
    appliesTo: extractAppliesTo(contract.goal, contract.templateName),
    templateName: contract.templateName,
    riskLevel: contract.riskLevel,
    requiredChecks: config.requiredChecks,
    scopeInclude: contract.scopeInclude,
    outOfScope: contract.outOfScope,
    acceptanceCriteria: contract.acceptanceCriteria.map((item) => item.criterion),
  };
}

export function deriveTemplateName(goal: string): string {
  return slugify(goal);
}

export async function saveTemplateDraft(
  workDir: string,
  template: TemplateDraft,
): Promise<string> {
  const templatesDir = path.join(workDir, '.harness', 'templates');
  const filePath = path.join(templatesDir, `${template.name}.yaml`);

  await mkdir(templatesDir, { recursive: true });
  await writeFile(filePath, serializeTemplateDraft(template), 'utf8');

  return filePath;
}
