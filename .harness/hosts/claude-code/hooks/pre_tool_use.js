const { COMPLETION_GATE_COMMAND, readHookPayload, resolvePayloadCwd, runHarnesslyJson, writeHookOutput } = require('./shared/claude-code-hook-io.js');

const ARTIFACT_GUARD_COMMAND = `${COMPLETION_GATE_COMMAND.replace('host completion-gate', 'host artifact-guard')}`;

(function main() {
  try {
    const payload = readHookPayload();
    const toolName = payload?.tool_name || '';
    if (toolName !== 'Edit' && toolName !== 'Write') {
      writeHookOutput({ continue: true });
      return;
    }
    const filePath = payload?.tool_input?.file_path || '';
    if (!filePath) {
      writeHookOutput({ continue: true });
      return;
    }
    const cwd = resolvePayloadCwd(payload);
    try {
      const result = runHarnesslyJson(`${ARTIFACT_GUARD_COMMAND} --file "$HARNESSLY_ARTIFACT_FILE"`, cwd, {
        HARNESSLY_ARTIFACT_FILE: filePath,
      });
      if (result && !result.allowed) {
        writeHookOutput({
          decision: 'block',
          reason: `Harnessly 写保护：${result.reason}`
        });
        return;
      }
    } catch {
      // artifact-guard 不可用时放行，避免阻断正常流程
    }
    writeHookOutput({ continue: true });
  } catch (error) {
    writeHookOutput({
      continue: true,
      additionalContext: `Claude Code PreToolUse hook 执行失败：${error instanceof Error ? error.message : String(error)}`,
    });
  }
})();
