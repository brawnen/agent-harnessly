const { buildCompletionDecision, buildCodexHookOutput, COMPLETION_GATE_COMMAND, readHookPayload, resolvePayloadCwd, runHarnesslyJson, writeContinue, writeHookOutput } = require('./shared/codex-hook-io.js');

(function main() {
  try {
    const payload = readHookPayload();
    const cwd = resolvePayloadCwd(payload);
    const message = typeof payload?.last_assistant_message === "string" ? payload.last_assistant_message : "";
    const result = runHarnesslyJson(`${COMPLETION_GATE_COMMAND} --message "$HARNESSLY_HOOK_LAST_MESSAGE"`, cwd, {
      HARNESSLY_HOOK_LAST_MESSAGE: message,
    });
    const decision = buildCompletionDecision(result);
    writeHookOutput(buildCodexHookOutput('Stop', decision));
  } catch (error) {
    writeContinue('Stop', `Codex Stop hook 执行失败：${error instanceof Error ? error.message : String(error)}`);
  }
})();
