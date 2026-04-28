// src/index.ts
import { createHostManifest } from "@harnessly/host-shared";
var DEFAULT_SUBAGENTS = {
  planner: {
    useHostPlanMode: true,
    models: {
      "claude-code": "haiku"
    }
  },
  evaluator: {
    models: {
      "claude-code": "sonnet"
    }
  }
};
function getClaudeCodeHostManifest() {
  return createHostManifest("claude-code");
}
function renderClaudeCodeSettings(manifest) {
  return `${JSON.stringify(
    {
      hooks: {
        SessionStart: [
          {
            type: "command",
            command: manifest.sessionStartCommand
          }
        ],
        UserPromptSubmit: [
          {
            type: "command",
            command: manifest.userPromptSubmitCommand
          }
        ],
        Stop: [
          {
            type: "command",
            command: manifest.completionGateCommand
          }
        ]
      }
    },
    null,
    2
  )}
`;
}
function renderClaudeCodePlannerAgent(config = DEFAULT_SUBAGENTS) {
  const model = config.planner.models["claude-code"] ?? "haiku";
  const planModeLine = config.planner.useHostPlanMode ? "- \u4F18\u5148\u4F7F\u7528\u5BBF\u4E3B plan mode \u5B8C\u6210\u76EE\u6807\u6F84\u6E05\u3001scope\u3001acceptance criteria \u548C\u6267\u884C\u6B65\u9AA4\u5EFA\u6A21\u3002" : "- \u4E0D\u8981\u6C42\u4F7F\u7528\u5BBF\u4E3B plan mode\uFF1B\u4F46\u4ECD\u5FC5\u987B\u5728\u6267\u884C\u524D\u5B8C\u6210\u76EE\u6807\u6F84\u6E05\u3001scope \u548C\u9A8C\u6536\u6807\u51C6\u5EFA\u6A21\u3002";
  return [
    "---",
    "name: harness-planner",
    "description: \u5C06\u7528\u6237\u76EE\u6807\u8F6C\u6362\u4E3A Harnessly contract \u548C plan",
    `model: ${model}`,
    "tools:",
    "  - Read",
    "  - Bash",
    "---",
    "",
    "# Harness Planner",
    "",
    "\u4F60\u662F Harnessly Planner\u3002\u4F60\u7684\u804C\u8D23\u662F\u628A\u7528\u6237\u76EE\u6807\u8F6C\u6210\u7ED3\u6784\u5316 contract \u548C plan\u3002",
    "",
    "## \u5DE5\u4F5C\u539F\u5219",
    "",
    `- \u542F\u52A8\u540E\u7684\u7B2C\u4E00\u6B65\u5FC5\u987B\u8C03\u7528\uFF1Aharnessly host agent-event --agent harness-planner --event started --model ${model}`,
    "- \u4F60\u4E0D\u662F\u4EE3\u7801\u5B9E\u73B0\u8005\uFF0C\u4E0D\u8981\u4FEE\u6539\u4E1A\u52A1\u4EE3\u7801\u3002",
    planModeLine,
    "- plan mode \u6216\u81EA\u7136\u8BED\u8A00\u8BA1\u5212\u4E0D\u80FD\u66FF\u4EE3 Harnessly \u5DE5\u4EF6\u3002",
    "- \u4F60\u5FC5\u987B\u786E\u4FDD\u4EFB\u52A1\u5148\u8FDB\u5165 Contract -> Plan\uFF0C\u518D\u8FDB\u5165 Execute\u3002",
    "- \u4F60\u7684\u81EA\u7136\u8BED\u8A00\u7ED3\u8BBA\u4E0D\u80FD\u66FF\u4EE3 `.harness/tasks/<task-id>/contract.yaml` \u548C `plan.md`\u3002",
    "- \u82E5\u9700\u8981\u521B\u5EFA\u65B0\u4EFB\u52A1\uFF0C\u4F18\u5148\u901A\u8FC7 repo-local Harnessly command bridge \u89E6\u53D1\uFF0C\u800C\u4E0D\u662F\u53E3\u5934\u63CF\u8FF0\u3002",
    "- contract \u5FC5\u987B\u5305\u542B goal\u3001scope\u3001out_of_scope\u3001acceptance criteria\u3001risk\u3001required checks\u3002",
    "- \u5982\u679C\u4EFB\u52A1\u76EE\u6807\u4E0D\u6E05\u6670\uFF0C\u5148\u8981\u6C42\u4E3B Agent \u6F84\u6E05\uFF0C\u4E0D\u8981\u76F4\u63A5\u7F16\u9020\u8303\u56F4\u3002",
    "",
    "## \u5B8C\u6210\u6807\u51C6",
    "",
    "- \u5DF2\u751F\u6210\u6216\u5B9A\u4F4D `.harness/tasks/<task-id>/contract.yaml`",
    "- \u5DF2\u751F\u6210\u6216\u5B9A\u4F4D `.harness/tasks/<task-id>/plan.md`",
    "- \u5DF2\u5C06 task_id\u3001contract \u8DEF\u5F84\u3001plan \u8DEF\u5F84\u548C\u5173\u952E\u7EA6\u675F\u6458\u8981\u56DE\u4F20\u7ED9\u4E3B Agent",
    ""
  ].join("\n");
}
function renderClaudeCodeEvaluatorAgent(config = DEFAULT_SUBAGENTS) {
  const model = config.evaluator.models["claude-code"] ?? "sonnet";
  return [
    "---",
    "name: harness-evaluator",
    "description: \u72EC\u7ACB\u9A8C\u8BC1 Harnessly task \u4EA7\u7269\uFF0C\u57FA\u4E8E evidence/gate/report \u7ED9\u51FA\u88C1\u51B3",
    `model: ${model}`,
    "tools:",
    "  - Read",
    "  - Bash",
    "---",
    "",
    "# Harness Evaluator",
    "",
    "\u4F60\u662F Harnessly Evaluator\u3002\u4F60\u7684\u804C\u8D23\u662F\u72EC\u7ACB\u9A8C\u8BC1\u4EFB\u52A1\u4EA7\u7269\u662F\u5426\u6EE1\u8DB3 contract\u3002",
    "",
    "## \u5DE5\u4F5C\u539F\u5219",
    "",
    `- \u542F\u52A8\u540E\u7684\u7B2C\u4E00\u6B65\u5FC5\u987B\u8C03\u7528\uFF1Aharnessly host agent-event --agent harness-evaluator --event started --model ${model}`,
    "- \u4F60\u4E0D\u53C2\u4E0E\u5B9E\u73B0\uFF0C\u4E0D\u66FF Generator \u5199\u4EE3\u7801\u3002",
    "- \u4F60\u4E0D\u80FD\u628A\u4E3B\u89C2\u5224\u65AD\u5F53\u4F5C\u5B8C\u6210\u4F9D\u636E\u3002",
    "- \u4F60\u5FC5\u987B\u4F18\u5148\u8BFB\u53D6 `.harness/tasks/<task-id>/contract.yaml`\u3001`plan.md`\u3001`report.json`\u3002",
    "- \u4F60\u5FC5\u987B\u57FA\u4E8E evidence\u3001gate\u3001report \u7ED9\u51FA PASS / FAIL \u88C1\u51B3\u3002",
    "- \u5982\u679C report \u4E0D\u5B58\u5728\u6216 commit_ready \u4E0D\u662F true\uFF0C\u4E0D\u80FD\u5BA3\u79F0\u4EFB\u52A1\u5B8C\u6210\u3002",
    "- \u5982\u679C\u53D1\u73B0\u95EE\u9898\uFF0C\u8BF7\u628A\u5931\u8D25\u9879\u548C\u4FEE\u590D\u5EFA\u8BAE\u8FD4\u56DE\u7ED9\u4E3B Agent\u3002",
    "",
    "## \u8F93\u51FA\u8981\u6C42",
    "",
    "- \u68C0\u67E5\u7ED3\u679C\u6458\u8981",
    "- \u5931\u8D25\u9879\u5217\u8868",
    "- Gate \u88C1\u51B3\uFF1APASS \u6216 FAIL",
    "- \u4E0B\u4E00\u6B65\u5EFA\u8BAE",
    ""
  ].join("\n");
}
function renderClaudeCodeManagedFiles(manifest, config = DEFAULT_SUBAGENTS) {
  return {
    ".claude/settings.json": renderClaudeCodeSettings(manifest),
    ".claude/agents/harness-planner.md": renderClaudeCodePlannerAgent(config),
    ".claude/agents/harness-evaluator.md": renderClaudeCodeEvaluatorAgent(config)
  };
}
export {
  getClaudeCodeHostManifest,
  renderClaudeCodeEvaluatorAgent,
  renderClaudeCodeManagedFiles,
  renderClaudeCodePlannerAgent,
  renderClaudeCodeSettings
};
