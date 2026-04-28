import { access } from 'node:fs/promises';
import path from 'node:path';

import type { ProjectType, RequiredCheck } from '@harnessly/shared';

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function detectProjectType(workDir: string): Promise<ProjectType> {
  if (await fileExists(path.join(workDir, 'package.json'))) {
    return 'node';
  }

  if (await fileExists(path.join(workDir, 'go.mod'))) {
    return 'go';
  }

  if (
    (await fileExists(path.join(workDir, 'pyproject.toml'))) ||
    (await fileExists(path.join(workDir, 'requirements.txt')))
  ) {
    return 'python';
  }

  return 'unknown';
}

export function getDefaultRequiredChecks(projectType: ProjectType): RequiredCheck[] {
  switch (projectType) {
    case 'go':
      return ['build', 'test'];
    case 'python':
      return ['test'];
    case 'node':
    case 'unknown':
    default:
      return ['build', 'lint', 'typecheck', 'test'];
  }
}
