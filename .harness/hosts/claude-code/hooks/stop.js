const { buildCompletionDecision, COMPLETION_GATE_COMMAND, readHookPayload, resolvePayloadCwd, runHarnesslyJson, writeHookOutput } = require('./shared/claude-code-hook-io.js');

(function main() {
  try {
    const payload = readHookPayload();
    const cwd = resolvePayloadCwd(payload);
    const message = typeof payload?.stopReason === "string" ? payload.stopReason : "";
    const result = runHarnesslyJson(`${COMPLETION_GATE_COMMAND} --message "$HARNESSLY_HOOK_LAST_MESSAGE"`, cwd, {
      HARNESSLY_HOOK_LAST_MESSAGE: message,
    });
    writeHookOutput(buildCompletionDecision(result));
  } catch (error) {
    writeHookOutput({
      continue: true,
      additionalContext: `Claude Code Stop hook 执行失败：${error instanceof Error ? error.message : String(error)}`,
    });
  }
})();
