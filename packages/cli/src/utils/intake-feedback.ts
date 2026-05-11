import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { getHarnessPaths } from '@brawnen/harnessly-core';

export type IntakeActionLabel = 'chat' | 'delegate_to_planner' | 'create_task' | 'resume_task';

export interface IntakeFeedbackEntry {
  id: string;
  prompt: string;
  normalizedPrompt: string;
  predictedAction: IntakeActionLabel;
  actualAction: IntakeActionLabel;
  reason: string;
  createdAt: string;
}

export interface LastIntakeDecision {
  prompt: string;
  action: IntakeActionLabel;
  reason: string;
  taskKind: string;
  risk: string;
  createdAt: string;
}

export interface LearnedIntakeDecision {
  action: IntakeActionLabel;
  reason: 'learned_exact_feedback' | 'learned_similar_feedback';
  confidence: number;
  matchedEntryIds: string[];
}

const FEEDBACK_FILENAME = 'intake-feedback.jsonl';
const LAST_DECISION_FILENAME = 'intake-last.json';

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT'
  );
}

export function normalizePromptForFeedback(prompt: string): string {
  return prompt
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[？?。.!！,，；;：:]/g, '');
}

export function getIntakeFeedbackPath(workDir: string): string {
  return path.join(getHarnessPaths(workDir).harnessDir, FEEDBACK_FILENAME);
}

export function getLastIntakeDecisionPath(workDir: string): string {
  return path.join(getHarnessPaths(workDir).harnessDir, LAST_DECISION_FILENAME);
}

export async function writeLastIntakeDecision(
  workDir: string,
  decision: Omit<LastIntakeDecision, 'createdAt'>,
): Promise<void> {
  const filePath = getLastIntakeDecisionPath(workDir);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    `${JSON.stringify({ ...decision, createdAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  );
}

export async function readLastIntakeDecision(workDir: string): Promise<LastIntakeDecision | null> {
  try {
    return JSON.parse(await readFile(getLastIntakeDecisionPath(workDir), 'utf8')) as LastIntakeDecision;
  } catch (error) {
    if (isMissingFileError(error)) return null;
    return null;
  }
}

export async function appendIntakeFeedback(
  workDir: string,
  feedback: {
    prompt: string;
    predictedAction: IntakeActionLabel;
    actualAction: IntakeActionLabel;
    reason: string;
  },
): Promise<IntakeFeedbackEntry> {
  const entry: IntakeFeedbackEntry = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    prompt: feedback.prompt,
    normalizedPrompt: normalizePromptForFeedback(feedback.prompt),
    predictedAction: feedback.predictedAction,
    actualAction: feedback.actualAction,
    reason: feedback.reason,
    createdAt: new Date().toISOString(),
  };

  const filePath = getIntakeFeedbackPath(workDir);
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(entry)}\n`, 'utf8');
  return entry;
}

export async function loadIntakeFeedback(workDir: string): Promise<IntakeFeedbackEntry[]> {
  try {
    const text = await readFile(getIntakeFeedbackPath(workDir), 'utf8');
    const entries: IntakeFeedbackEntry[] = [];
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      try {
        const parsed = JSON.parse(line) as IntakeFeedbackEntry;
        if (parsed.prompt && parsed.actualAction && parsed.normalizedPrompt) {
          entries.push(parsed);
        }
      } catch {
        // 损坏行跳过，保留其他反馈可用
      }
    }
    return entries;
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }
}

export async function rewriteIntakeFeedback(
  workDir: string,
  entries: readonly IntakeFeedbackEntry[],
): Promise<void> {
  const filePath = getIntakeFeedbackPath(workDir);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, entries.map((entry) => JSON.stringify(entry)).join('\n') + (entries.length ? '\n' : ''), 'utf8');
}

function trigrams(value: string): Set<string> {
  const normalized = normalizePromptForFeedback(value);
  const padded = `  ${normalized}  `;
  const result = new Set<string>();
  for (let i = 0; i < padded.length - 2; i += 1) {
    result.add(padded.slice(i, i + 3));
  }
  return result;
}

function similarity(left: string, right: string): number {
  const a = trigrams(left);
  const b = trigrams(right);
  if (a.size === 0 || b.size === 0) return 0;
  const intersection = [...a].filter((item) => b.has(item)).length;
  return intersection / new Set([...a, ...b]).size;
}

export function classifyByIntakeFeedback(
  prompt: string,
  entries: readonly IntakeFeedbackEntry[],
): LearnedIntakeDecision | null {
  const normalized = normalizePromptForFeedback(prompt);
  const exact = [...entries].reverse().find((entry) => entry.normalizedPrompt === normalized);
  if (exact) {
    return {
      action: exact.actualAction,
      reason: 'learned_exact_feedback',
      confidence: 1,
      matchedEntryIds: [exact.id],
    };
  }

  const similarChatEntries = entries
    .map((entry) => ({ entry, score: similarity(normalized, entry.normalizedPrompt) }))
    .filter(({ entry, score }) => entry.actualAction === 'chat' && score >= 0.85)
    .sort((a, b) => b.score - a.score);

  if (similarChatEntries.length > 0) {
    return {
      action: 'chat',
      reason: 'learned_similar_feedback',
      confidence: similarChatEntries[0]!.score,
      matchedEntryIds: similarChatEntries.slice(0, 3).map(({ entry }) => entry.id),
    };
  }

  const weakerChatEntries = entries
    .map((entry) => ({ entry, score: similarity(normalized, entry.normalizedPrompt) }))
    .filter(({ entry, score }) => entry.actualAction === 'chat' && score >= 0.72)
    .sort((a, b) => b.score - a.score);

  if (weakerChatEntries.length >= 2) {
    return {
      action: 'chat',
      reason: 'learned_similar_feedback',
      confidence: weakerChatEntries[0]!.score,
      matchedEntryIds: weakerChatEntries.slice(0, 3).map(({ entry }) => entry.id),
    };
  }

  return null;
}
