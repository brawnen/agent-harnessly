const { buildSessionStartContext, readHookPayload, resolvePayloadCwd, runHarnesslyJson, SESSION_START_COMMAND, writeHookOutput } = require('./shared/claude-code-hook-io.js');

(function main() {
  try {
    const payload = readHookPayload();
    const cwd = resolvePayloadCwd(payload);
    const result = runHarnesslyJson(SESSION_START_COMMAND, cwd);
    writeHookOutput({
      continue: true,
      additionalContext: buildSessionStartContext(result),
    });
  } catch (error) {
    writeHookOutput({
      continue: true,
      additionalContext: `Claude Code SessionStart hook 执行失败：${error instanceof Error ? error.message : String(error)}`,
    });
  }
})();
