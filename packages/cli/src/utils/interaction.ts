import { createInterface } from 'node:readline/promises';

import { printLines } from './output';

export interface ConfirmationStreams {
  input: NodeJS.ReadableStream & { isTTY?: boolean };
  output: NodeJS.WritableStream & { isTTY?: boolean };
  env: NodeJS.ProcessEnv;
}

export interface ContractConfirmationSummary {
  taskId: string;
  goal: string;
  templateName: string;
  contractPath: string;
  planPath: string;
}

export function shouldAutoConfirm(
  flags: Record<string, string | boolean>,
  streams: ConfirmationStreams = {
    input: process.stdin,
    output: process.stdout,
    env: process.env,
  },
): boolean {
  if (flags['skip-confirm'] === true) {
    return true;
  }

  if (streams.env.CI === 'true') {
    return true;
  }

  return streams.input.isTTY !== true || streams.output.isTTY !== true;
}

export function normalizeConfirmationAnswer(answer: string): boolean | null {
  const normalized = answer.trim().toLowerCase();

  if (normalized === 'y' || normalized === 'yes') {
    return true;
  }

  if (normalized === 'n' || normalized === 'no') {
    return false;
  }

  return null;
}

export async function confirmContract(
  summary: ContractConfirmationSummary,
  flags: Record<string, string | boolean>,
  streams: ConfirmationStreams = {
    input: process.stdin,
    output: process.stdout,
    env: process.env,
  },
): Promise<boolean> {
  if (shouldAutoConfirm(flags, streams)) {
    return true;
  }

  printLines([
    'Contract 待确认',
    `- task_id: ${summary.taskId}`,
    `- goal: ${summary.goal}`,
    `- template: ${summary.templateName}`,
    `- contract: ${summary.contractPath}`,
    `- plan: ${summary.planPath}`,
  ]);

  const readline = createInterface({
    input: streams.input,
    output: streams.output,
  });

  try {
    while (true) {
      const answer = normalizeConfirmationAnswer(
        await readline.question('确认 contract 与 plan？(y/n) '),
      );

      if (answer !== null) {
        return answer;
      }

      streams.output.write('请输入 y 或 n。\n');
    }
  } finally {
    readline.close();
  }
}
