const { buildCodexHookOutput, buildPromptSubmitContext, readHookPayload, resolvePayloadCwd, resolvePayloadPrompt, runHarnesslyJson, USER_PROMPT_COMMAND, writeContinue, writeHookOutput } = require('./shared/codex-hook-io.js');

(function main() {
  try {
    const payload = readHookPayload();
    const cwd = resolvePayloadCwd(payload);
    const prompt = resolvePayloadPrompt(payload);
    const result = runHarnesslyJson(`${USER_PROMPT_COMMAND} --prompt "$HARNESSLY_HOOK_PROMPT"`, cwd, {
      HARNESSLY_HOOK_PROMPT: prompt,
    });
    writeHookOutput(
      buildCodexHookOutput('UserPromptSubmit', {
        status: 'continue',
        additionalContext: buildPromptSubmitContext(result, prompt),
      }),
    );
  } catch (error) {
    writeContinue('UserPromptSubmit', `Codex UserPromptSubmit hook 执行失败：${error instanceof Error ? error.message : String(error)}`);
  }
})();
