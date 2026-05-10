const { buildPromptSubmitContext, readHookPayload, resolvePayloadCwd, resolvePayloadPrompt, runHarnesslyJson, USER_PROMPT_COMMAND, writeHookOutput } = require('./shared/claude-code-hook-io.js');

(function main() {
  try {
    const payload = readHookPayload();
    const cwd = resolvePayloadCwd(payload);
    const prompt = resolvePayloadPrompt(payload);
    const result = runHarnesslyJson(`${USER_PROMPT_COMMAND} --prompt "$HARNESSLY_HOOK_PROMPT"`, cwd, {
      HARNESSLY_HOOK_PROMPT: prompt,
    });
    writeHookOutput({
      continue: true,
      additionalContext: buildPromptSubmitContext(result, prompt),
    });
  } catch (error) {
    writeHookOutput({
      continue: true,
      additionalContext: `Claude Code UserPromptSubmit hook 执行失败：${error instanceof Error ? error.message : String(error)}`,
    });
  }
})();
