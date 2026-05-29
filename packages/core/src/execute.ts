import { exec } from 'node:child_process';
import { promisify } from 'node:util';

import type { AdapterInput, AdapterKind, AdapterOutput } from '@brawnen/harnessly-shared';

const execAsync = promisify(exec);

async function runShellCommand(command: string, input: AdapterInput): Promise<AdapterOutput> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: input.workDir,
      env: {
        ...process.env,
        HARNESSLY_TASK_ID: input.taskId,
        HARNESSLY_WORKDIR: input.workDir,
        HARNESSLY_PROMPT_FILE: input.promptFile,
      },
      shell: '/bin/zsh',
    });

    return {
      kind: 'custom',
      command,
      exitCode: 0,
      stdout,
      stderr,
    };
  } catch (error) {
    const execError = error as { code?: number; stdout?: string; stderr?: string };

    return {
      kind: 'custom',
      command,
      exitCode: execError.code ?? 1,
      stdout: execError.stdout ?? '',
      stderr: execError.stderr ?? '',
    };
  }
}

export interface Adapter {
  readonly kind: AdapterKind;
  execute(input: AdapterInput): Promise<AdapterOutput>;
}

export class CustomAdapter implements Adapter {
  readonly kind = 'custom' as const;

  async execute(input: AdapterInput): Promise<AdapterOutput> {
    const command = input.command?.trim();
    if (!command) {
      throw new Error('custom adapter 缺少 command');
    }

    const result = await runShellCommand(command, input);
    return {
      ...result,
      kind: this.kind,
    };
  }
}

export class ClaudeCodeAdapter implements Adapter {
  readonly kind = 'claude-code' as const;

  async execute(input: AdapterInput): Promise<AdapterOutput> {
    const command = input.command?.trim();
    if (!command) {
      throw new Error(
        'claude-code adapter 尚未配置实际执行命令。请通过 --adapter-command 或 harness.config.yaml 提供。',
      );
    }

    const result = await runShellCommand(command, input);
    return {
      ...result,
      kind: this.kind,
    };
  }
}

/**
 * Codex adapter 默认执行命令：通过 stdin 把 prompt 文件喂给 `codex exec`。
 * 提取为导出常量，便于单测直接断言命令拼接（不必真实跑 codex 二进制）。
 */
export const DEFAULT_CODEX_COMMAND = 'codex exec --full-auto - < "$HARNESSLY_PROMPT_FILE"';

export class CodexAdapter implements Adapter {
  readonly kind = 'codex' as const;

  async execute(input: AdapterInput): Promise<AdapterOutput> {
    const command = input.command?.trim() || DEFAULT_CODEX_COMMAND;
    const result = await runShellCommand(command, input);
    return {
      ...result,
      kind: this.kind,
    };
  }
}

export function createAdapter(kind: AdapterKind): Adapter {
  switch (kind) {
    case 'claude-code':
      return new ClaudeCodeAdapter();
    case 'codex':
      return new CodexAdapter();
    case 'custom':
    default:
      return new CustomAdapter();
  }
}
