import { runArchive } from './commands/archive';
import { runEvidenceBaseline } from './commands/evidence-baseline';
import { runFeedback } from './commands/feedback';
import { runInit } from './commands/init';
import { runIntake } from './commands/intake';
import { runHostAgentEvent } from './commands/host/agent-event';
import { runHostArtifactGuard } from './commands/host/artifact-guard';
import { runHostCompletionGate } from './commands/host/completion-gate';
import { runHostInstall } from './commands/host/install';
import { runHostResidentReview } from './commands/host/resident-review';
import { runHostSessionStart } from './commands/host/session-start';
import { runHostStatus } from './commands/host/status';
import { runHostSync } from './commands/host/sync';
import { runHostUserPromptSubmit } from './commands/host/user-prompt-submit';
import { runEval } from './commands/eval';
import { runList } from './commands/list';
import { runRetry } from './commands/retry';
import { runTask } from './commands/run';
import { runStatus } from './commands/status';
import { runTemplatePromote } from './commands/template-promote';
import { runUpgrade } from './commands/upgrade';
import { parseArgs } from './utils/args';
import { CLI_PACKAGE_NAME, CLI_VERSION } from './version';

function printUsage(): void {
  process.stdout.write(
    [
      'Usage:',
      '  harnessly --version',
      '  harnessly init [--host claude-code|codex|gemini-cli] [--force]',
      '  harnessly eval [task-id]',
      '  harnessly list [--json]',
      '  harnessly status [task-id] [--json]',
      '  harnessly retry [task-id] [--adapter custom|codex --adapter-command "<cmd>"]',
      '  harnessly run --dry-run [--skip-confirm] "<goal>"',
      '  harnessly run --resume <task-id>',
      '  harnessly run [--skip-confirm] --adapter custom|codex --adapter-command "<cmd>" "<goal>"',
      '  harnessly upgrade [--task-id <task-id>]',
      '  harnessly template promote [task-id] [--name <template-name>]',
      '  harnessly archive promote <task-id> --topic=<slug> --files=<list> [--mode=<mode>] [--json]',
      '  harnessly archive list [--json]',
      '  harnessly archive show <topic> [--json]',
      '  harnessly archive verify [--json]',
      '  harnessly evidence baseline [--show] [--clear] [--json]',
      '  harnessly feedback list',
      '  harnessly feedback promote <task-id> [reason]',
      '  harnessly intake feedback list|add|remove|clear',
      '  harnessly host install [--host auto|all|claude-code|codex|gemini-cli]',
      '  harnessly host status [--json]',
      '  harnessly host sync [--host auto|all|claude-code|codex|gemini-cli]',
      '  harnessly host session-start',
      '  harnessly host user-prompt-submit [--prompt "..."]',
      '  harnessly host completion-gate [--message "..."]',
      '  harnessly host agent-event --agent harness-planner|harness-evaluator [--event started|completed] [--task-id <task-id>] [--model <model>]',
  '  harnessly host artifact-guard --file <path> [--task-id <id>]',
  '  harnessly host resident-review --trigger <pre_push|pre_merge> [--task-id <id>]',
    ].join('\n') + '\n',
  );
}

export async function runCli(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);
  const [command, subcommand, ...rest] = parsed.positionals;

  if (parsed.flags.version === true || command === 'version') {
    process.stdout.write(`${CLI_PACKAGE_NAME} ${CLI_VERSION}\n`);
    return;
  }

  if (!command || command === '--help' || command === 'help') {
    printUsage();
    return;
  }

  if (command === 'init') {
    await runInit(parsed.flags);
    return;
  }

  if (command === 'list') {
    await runList(parsed.flags);
    return;
  }

  if (command === 'status') {
    await runStatus(parsed.flags, [subcommand, ...rest].filter(Boolean));
    return;
  }

  if (command === 'eval') {
    await runEval(parsed.flags, [subcommand, ...rest].filter(Boolean));
    return;
  }

  if (command === 'run') {
    await runTask(parsed.flags, [subcommand, ...rest].filter(Boolean));
    return;
  }

  if (command === 'retry') {
    await runRetry(parsed.flags, [subcommand, ...rest].filter(Boolean));
    return;
  }

  if (command === 'upgrade') {
    await runUpgrade(parsed.flags);
    return;
  }

  if (command === 'template' && subcommand === 'promote') {
    await runTemplatePromote(parsed.flags, rest);
    return;
  }

  if (command === 'archive') {
    await runArchive(parsed.flags, [subcommand, ...rest].filter(Boolean));
    return;
  }

  if (command === 'evidence' && subcommand === 'baseline') {
    await runEvidenceBaseline(parsed.flags);
    return;
  }

  if (command === 'feedback') {
    await runFeedback([subcommand, ...rest].filter(Boolean));
    return;
  }

  if (command === 'intake') {
    await runIntake(parsed.flags, [subcommand, ...rest].filter(Boolean));
    return;
  }

  if (command === 'host') {
    switch (subcommand) {
      case 'install':
        await runHostInstall(parsed.flags);
        return;
      case 'status':
        await runHostStatus(parsed.flags);
        return;
      case 'sync':
        await runHostSync(parsed.flags);
        return;
      case 'session-start':
        await runHostSessionStart();
        return;
      case 'user-prompt-submit':
        await runHostUserPromptSubmit(parsed.flags, rest);
        return;
      case 'completion-gate':
        await runHostCompletionGate(parsed.flags, rest);
        return;
      case 'agent-event':
        await runHostAgentEvent(parsed.flags, rest);
        return;
      case 'artifact-guard':
        await runHostArtifactGuard(parsed.flags);
        return;
      case 'resident-review':
        await runHostResidentReview(parsed.flags);
        return;
      default:
        printUsage();
        return;
    }
  }

  printUsage();
}
