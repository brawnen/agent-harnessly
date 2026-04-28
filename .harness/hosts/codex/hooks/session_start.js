const { buildCodexHookOutput, buildSessionStartContext, readHookPayload, resolvePayloadCwd, runHarnesslyJson, SESSION_START_COMMAND, writeContinue, writeHookOutput } = require('./shared/codex-hook-io.js');

(function main() {
  try {
    const payload = readHookPayload();
    const cwd = resolvePayloadCwd(payload);
    const result = runHarnesslyJson(SESSION_START_COMMAND, cwd);
    writeHookOutput(
      buildCodexHookOutput('SessionStart', {
        status: 'continue',
        additionalContext: buildSessionStartContext(result),
      }),
    );
  } catch (error) {
    writeContinue('SessionStart', `Codex SessionStart hook 执行失败：${error instanceof Error ? error.message : String(error)}`);
  }
})();
