import {
  appendIntakeFeedback,
  loadIntakeFeedback,
  readLastIntakeDecision,
  rewriteIntakeFeedback,
  type IntakeActionLabel,
} from '../utils/intake-feedback';
import { printJson, printLines } from '../utils/output';

const VALID_ACTIONS: readonly IntakeActionLabel[] = [
  'chat',
  'delegate_to_planner',
  'create_task',
  'resume_task',
] as const;

function readStringFlag(flags: Record<string, string | boolean>, name: string): string {
  const value = flags[name];
  return typeof value === 'string' ? value.trim() : '';
}

function parseAction(value: string): IntakeActionLabel {
  if ((VALID_ACTIONS as readonly string[]).includes(value)) {
    return value as IntakeActionLabel;
  }
  throw new Error(`非法 action: ${value || '(empty)'}。允许值：${VALID_ACTIONS.join(', ')}`);
}

export async function runIntake(
  flags: Record<string, string | boolean>,
  positionals: string[],
): Promise<void> {
  const workDir = process.cwd();
  const [subcommand, ...rest] = positionals;

  if (!subcommand || subcommand === 'feedback') {
    await runIntakeFeedback(workDir, flags, subcommand === 'feedback' ? rest : positionals);
    return;
  }

  throw new Error(`未知 intake 子命令：${subcommand}`);
}

async function runIntakeFeedback(
  workDir: string,
  flags: Record<string, string | boolean>,
  positionals: string[],
): Promise<void> {
  const [subcommand, ...rest] = positionals;

  if (!subcommand || subcommand === 'list') {
    const entries = await loadIntakeFeedback(workDir);
    if (flags.json) {
      printJson(entries);
      return;
    }
    printLines(
      entries.length === 0
        ? ['没有 intake feedback。']
        : entries.map((entry) => `${entry.id}\t${entry.actualAction}\t${entry.reason}\t${entry.prompt}`),
    );
    return;
  }

  if (subcommand === 'add') {
    const useLast = flags.last === true;
    const actual = parseAction(readStringFlag(flags, 'actual'));
    const reason = readStringFlag(flags, 'reason') || 'manual correction';
    const prompt = readStringFlag(flags, 'prompt') || rest.join(' ').trim();

    let finalPrompt = prompt;
    let predictedAction: IntakeActionLabel = parseAction(readStringFlag(flags, 'predicted') || 'chat');
    if (useLast) {
      const last = await readLastIntakeDecision(workDir);
      if (!last) {
        throw new Error('没有可用于 --last 的 intake-last.json。请改用 --prompt。');
      }
      finalPrompt = last.prompt;
      predictedAction = last.action;
    }

    if (!finalPrompt) {
      throw new Error('缺少 prompt。用法：harnessly intake feedback add --actual chat --prompt "..."');
    }

    const entry = await appendIntakeFeedback(workDir, {
      prompt: finalPrompt,
      predictedAction,
      actualAction: actual,
      reason,
    });

    if (flags.json) {
      printJson(entry);
      return;
    }
    printLines([`intake feedback added: ${entry.id}`]);
    return;
  }

  if (subcommand === 'remove') {
    const id = readStringFlag(flags, 'id') || rest[0]?.trim();
    if (!id) {
      throw new Error('缺少 id。用法：harnessly intake feedback remove <id>');
    }
    const entries = await loadIntakeFeedback(workDir);
    const kept = entries.filter((entry) => entry.id !== id);
    await rewriteIntakeFeedback(workDir, kept);
    printLines([`intake feedback removed: ${entries.length - kept.length}`]);
    return;
  }

  if (subcommand === 'clear') {
    await rewriteIntakeFeedback(workDir, []);
    printLines(['intake feedback cleared']);
    return;
  }

  throw new Error(`未知 intake feedback 子命令：${subcommand}`);
}
