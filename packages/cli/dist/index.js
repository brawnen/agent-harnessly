#!/usr/bin/env node

// src/index.ts
import { fileURLToPath } from "url";
import { getCorePackageInfo } from "@harnessly/core";

// src/commands/init.ts
import { writeFile as writeFile2 } from "fs/promises";
import {
  createDefaultHarnessConfig,
  detectProjectType,
  ensureHarnessDirectories,
  renderGlobalRulesTemplate,
  writeFileIfChanged,
  writeHarnessConfig
} from "@harnessly/core";

// src/utils/hosts.ts
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { getHarnessPaths, loadHarnessConfig } from "@harnessly/core";
import { renderClaudeCodeManagedFiles } from "@harnessly/host-claude-code";
import { renderCodexManagedFiles } from "@harnessly/host-codex";
import {
  createHostManifest,
  getHostManifestFilename,
  parseHostManifest,
  serializeHostManifest
} from "@harnessly/host-shared";
async function readFileIfExists(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}
function quoteShellArg(value) {
  return `"${value.replace(/(["\\$`])/g, "\\$1")}"`;
}
function getCurrentHarnesslyCommand() {
  if (process.env.HARNESSLY_BIN?.trim()) {
    return process.env.HARNESSLY_BIN.trim();
  }
  const entry = process.argv[1];
  if (!entry) {
    return "harnessly";
  }
  if (entry.endsWith(".js")) {
    return `${quoteShellArg(process.execPath)} ${quoteShellArg(entry)}`;
  }
  return quoteShellArg(entry);
}
function isBareHarnesslyCommand(command) {
  return command.trim().startsWith("harnessly ");
}
function refreshManifestCommand(manifest, commandPrefix) {
  const shouldRefresh = isBareHarnesslyCommand(manifest.sessionStartCommand) || isBareHarnesslyCommand(manifest.userPromptSubmitCommand) || isBareHarnesslyCommand(manifest.completionGateCommand);
  if (!shouldRefresh) {
    return manifest;
  }
  return {
    ...manifest,
    sessionStartCommand: `${commandPrefix} host session-start`,
    userPromptSubmitCommand: `${commandPrefix} host user-prompt-submit`,
    completionGateCommand: `${commandPrefix} host completion-gate`
  };
}
async function ensureHostManifest(workDir, host) {
  const manifestPath = path.join(getHarnessPaths(workDir).hostsDir, getHostManifestFilename(host));
  const existing = await readFileIfExists(manifestPath);
  const commandPrefix = getCurrentHarnesslyCommand();
  if (existing) {
    const manifest2 = refreshManifestCommand(parseHostManifest(existing), commandPrefix);
    await writeFile(manifestPath, serializeHostManifest(manifest2), "utf8");
    return manifest2;
  }
  const manifest = createHostManifest(host, commandPrefix);
  await writeFile(manifestPath, serializeHostManifest(manifest), "utf8");
  return manifest;
}
async function loadEnabledHosts(workDir, requestedHost) {
  if (requestedHost && requestedHost !== "auto" && requestedHost !== "all") {
    return [requestedHost];
  }
  const config = await loadHarnessConfig(workDir);
  if (requestedHost === "all") {
    return config.enabledHosts;
  }
  if (config.enabledHosts.length > 0) {
    return config.enabledHosts;
  }
  return [config.defaultHost];
}
function renderRepoLocalShell(manifest, config) {
  switch (manifest.host) {
    case "claude-code":
      return renderClaudeCodeManagedFiles(manifest, config.hostSubagents);
    case "codex":
      return renderCodexManagedFiles(manifest, {
        subagents: config.hostSubagents,
        userPromptSubmitHookEnabled: config.codexUserPromptSubmitHookEnabled
      });
    default:
      return {};
  }
}
async function installHostShells(workDir, requestedHost) {
  const installedPaths = [];
  const hosts = await loadEnabledHosts(workDir, requestedHost);
  const config = await loadHarnessConfig(workDir);
  for (const host of hosts) {
    const manifest = await ensureHostManifest(workDir, host);
    const files = renderRepoLocalShell(manifest, config);
    for (const [relativePath, content] of Object.entries(files)) {
      const absolutePath = path.join(workDir, relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content, "utf8");
      installedPaths.push(relativePath);
    }
  }
  return installedPaths;
}
async function collectHostStatus(workDir) {
  const config = await loadHarnessConfig(workDir);
  const rows = [];
  for (const host of config.enabledHosts) {
    const manifestPath = path.join(getHarnessPaths(workDir).hostsDir, getHostManifestFilename(host));
    const manifestText = await readFileIfExists(manifestPath);
    if (!manifestText) {
      rows.push({
        host,
        manifest: "missing",
        shell: "missing",
        files: []
      });
      continue;
    }
    const manifest = parseHostManifest(manifestText);
    const expectedFiles = renderRepoLocalShell(manifest, config);
    let shellStatus = "installed";
    for (const [relativePath, expectedContent] of Object.entries(expectedFiles)) {
      const actual = await readFileIfExists(path.join(workDir, relativePath));
      if (actual === null) {
        shellStatus = "missing";
        break;
      }
      if (actual !== expectedContent) {
        shellStatus = "drift";
        break;
      }
    }
    rows.push({
      host,
      manifest: "present",
      shell: shellStatus,
      files: Object.keys(expectedFiles)
    });
  }
  return rows;
}
async function readActiveTaskId(workDir) {
  const filePath = getHarnessPaths(workDir).activeTaskFile;
  const content = await readFileIfExists(filePath);
  return content?.trim() || null;
}

// src/utils/output.ts
function printJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}
`);
}
function printLines(lines) {
  process.stdout.write(`${lines.join("\n")}
`);
}

// src/commands/init.ts
async function runInit(flags) {
  const workDir = process.cwd();
  const requestedHost = typeof flags.host === "string" ? flags.host : "claude-code";
  const force = flags.force === true;
  const projectType = await detectProjectType(workDir);
  const paths = await ensureHarnessDirectories(workDir);
  const config = createDefaultHarnessConfig(projectType, requestedHost);
  const configStatus = await writeHarnessConfig(workDir, config, force);
  const globalRulesStatus = await writeFileIfChanged(
    paths.globalRulesFile,
    renderGlobalRulesTemplate(),
    force
  );
  await ensureHostManifest(workDir, config.defaultHost);
  const installedPaths = config.installRepoLocalShells ? await installHostShells(workDir, config.defaultHost) : [];
  await writeFile2(paths.activeTaskFile, "", "utf8");
  printLines([
    "Harnessly \u521D\u59CB\u5316\u5B8C\u6210",
    `- project_type: ${projectType}`,
    `- config: ${configStatus}`,
    `- global_rules: ${globalRulesStatus}`,
    `- host: ${config.defaultHost}`,
    `- installed_shells: ${installedPaths.length > 0 ? installedPaths.join(", ") : "none"}`
  ]);
}

// src/commands/host/completion-gate.ts
import { access, readFile as readFile2 } from "fs/promises";
import path3 from "path";
import { getHarnessPaths as getHarnessPaths3 } from "@harnessly/core";

// src/utils/events.ts
import { appendFile, mkdir as mkdir2 } from "fs/promises";
import path2 from "path";
import { getHarnessPaths as getHarnessPaths2 } from "@harnessly/core";
async function appendHarnessEvent(workDir, event) {
  const harnessDir = getHarnessPaths2(workDir).harnessDir;
  await mkdir2(harnessDir, { recursive: true });
  await appendFile(
    path2.join(harnessDir, "events.jsonl"),
    `${JSON.stringify({
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      ...event
    })}
`,
    "utf8"
  );
}

// src/commands/host/completion-gate.ts
async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
async function loadReportCommitReady(filePath) {
  try {
    const report = JSON.parse(await readFile2(filePath, "utf8"));
    return report.commitReady ?? null;
  } catch {
    return null;
  }
}
function isCompletionClaim(message) {
  return /(完成|done|fixed|已修复|搞定|完成了)/i.test(message);
}
async function runHostCompletionGate(flags, positionals) {
  const workDir = process.cwd();
  const message = (typeof flags.message === "string" ? flags.message : "") || positionals.join(" ").trim();
  const activeTaskId = await readActiveTaskId(workDir);
  if (!activeTaskId) {
    printJson({
      pass: true,
      reason: "no_active_task"
    });
    return;
  }
  const reportFile = path3.join(getHarnessPaths3(workDir).tasksDir, activeTaskId, "report.json");
  const hasReport = await fileExists(reportFile);
  const commitReady = hasReport ? await loadReportCommitReady(reportFile) : null;
  const evalCommand = `harnessly eval ${activeTaskId}`;
  if (isCompletionClaim(message) && !hasReport) {
    await appendHarnessEvent(workDir, {
      type: "host.completion_gate_blocked",
      reason: "report_not_ready",
      activeTaskId,
      evaluatorAgent: "harness-evaluator",
      evalCommand,
      nextStep: "delegate_to_evaluator_or_run_eval"
    });
    printJson({
      pass: false,
      reason: "report_not_ready",
      activeTaskId,
      evaluatorAgent: "harness-evaluator",
      evalCommand,
      nextStep: "delegate_to_evaluator_or_run_eval"
    });
    return;
  }
  if (isCompletionClaim(message) && commitReady === false) {
    await appendHarnessEvent(workDir, {
      type: "host.completion_gate_blocked",
      reason: "commit_gate_not_passed",
      activeTaskId,
      evaluatorAgent: "harness-evaluator",
      evalCommand,
      nextStep: "fix_findings_then_rerun_eval"
    });
    printJson({
      pass: false,
      reason: "commit_gate_not_passed",
      activeTaskId,
      evaluatorAgent: "harness-evaluator",
      evalCommand,
      nextStep: "fix_findings_then_rerun_eval"
    });
    return;
  }
  printJson({
    pass: true,
    reason: hasReport ? commitReady ? "commit_ready" : "report_ready" : "no_completion_claim",
    activeTaskId
  });
}

// src/commands/host/agent-event.ts
function readStringFlag(flags, name) {
  return typeof flags[name] === "string" ? flags[name].trim() : "";
}
function normalizeAgent(value) {
  if (value === "harness-planner" || value === "harness-evaluator") {
    return value;
  }
  throw new Error("\u7F3A\u5C11\u6216\u975E\u6CD5 agent\u3002\u5141\u8BB8\u503C\uFF1Aharness-planner, harness-evaluator");
}
function normalizeEvent(value) {
  if (value === "started" || value === "completed") {
    return value;
  }
  throw new Error("\u7F3A\u5C11\u6216\u975E\u6CD5 event\u3002\u5141\u8BB8\u503C\uFF1Astarted, completed");
}
async function runHostAgentEvent(flags, positionals) {
  const workDir = process.cwd();
  const agent = normalizeAgent(readStringFlag(flags, "agent") || positionals[0] || "");
  const event = normalizeEvent(readStringFlag(flags, "event") || positionals[1] || "started");
  const activeTaskId = await readActiveTaskId(workDir);
  const taskId = readStringFlag(flags, "task-id") || activeTaskId || null;
  const model = readStringFlag(flags, "model") || null;
  await appendHarnessEvent(workDir, {
    type: `subagent.${event}`,
    agent,
    taskId,
    model
  });
  printJson({
    recorded: true,
    type: `subagent.${event}`,
    agent,
    taskId,
    model
  });
}

// src/commands/host/install.ts
async function runHostInstall(flags) {
  const requestedHost = typeof flags.host === "string" ? flags.host : "auto";
  const installedPaths = await installHostShells(process.cwd(), requestedHost);
  printLines([
    "Host shell \u5B89\u88C5\u5B8C\u6210",
    `- host: ${requestedHost}`,
    `- files: ${installedPaths.length > 0 ? installedPaths.join(", ") : "none"}`
  ]);
}

// src/commands/host/session-start.ts
import { TaskManager } from "@harnessly/core";
async function runHostSessionStart() {
  const activeTaskId = await readActiveTaskId(process.cwd());
  let task = null;
  let retryCount = 0;
  let lastFailureReason = null;
  if (activeTaskId) {
    const ctx = await new TaskManager().load(activeTaskId, process.cwd());
    task = {
      goal: ctx.goal,
      status: ctx.state.status
    };
    retryCount = ctx.state.retryCount;
    lastFailureReason = ctx.state.lastFailureReason ?? null;
  }
  printJson({
    hasActiveTask: Boolean(activeTaskId),
    activeTaskId,
    task,
    retryCount,
    lastFailureReason,
    recommendation: activeTaskId ? "resume" : "idle"
  });
}

// src/commands/host/status.ts
async function runHostStatus(flags) {
  const rows = await collectHostStatus(process.cwd());
  if (flags.json === true) {
    printJson(rows);
    return;
  }
  printLines([
    "Host \u72B6\u6001",
    ...rows.map(
      (row) => `- ${row.host}: manifest=${row.manifest}, shell=${row.shell}, files=${row.files.length > 0 ? row.files.join(", ") : "none"}`
    )
  ]);
}

// src/commands/host/sync.ts
async function runHostSync(flags) {
  const requestedHost = typeof flags.host === "string" ? flags.host : "auto";
  const installedPaths = await installHostShells(process.cwd(), requestedHost);
  printLines([
    "Host shell \u5DF2\u6309 source-of-truth \u91CD\u5199",
    `- host: ${requestedHost}`,
    `- files: ${installedPaths.length > 0 ? installedPaths.join(", ") : "none"}`
  ]);
}

// src/commands/host/user-prompt-submit.ts
import { loadHarnessConfig as loadHarnessConfig2, TaskManager as TaskManager2, WorkflowEngine } from "@harnessly/core";
function isHostInternalPrompt(prompt) {
  const normalized = prompt.trim();
  return normalized.includes("You will be presented with a user prompt") && normalized.includes("short title for a task") && normalized.includes("Generate a concise UI title");
}
function containsAny(prompt, patterns) {
  return patterns.some((pattern) => pattern.test(prompt));
}
function detectChangeKind(prompt) {
  const normalized = prompt.trim();
  if (containsAny(normalized, [/(修复|修一下|bug|报错|失败|异常|不对|不能|无法|fix)/i])) {
    return "bug_fix";
  }
  if (containsAny(normalized, [/(文档|README|说明|设计文档|试用文档|更新.*文档|补.*文档)/i])) {
    return "doc_change";
  }
  if (containsAny(normalized, [/(配置|config|yaml|toml|json|hook|模型配置|设置)/i])) {
    return "config_change";
  }
  if (containsAny(normalized, [/(测试|用例|test|spec|覆盖)/i])) {
    return "test_change";
  }
  if (containsAny(normalized, [/(重构|refactor|整理代码|抽象)/i])) {
    return "refactor";
  }
  if (containsAny(normalized, [/(实现|新增|添加|修改|删除|接入|落地|改造|优化|调整|升级|补上|补充|更新|implement|add|update|remove)/i])) {
    return "code_change";
  }
  return null;
}
function isQuestionOnly(prompt) {
  const normalized = prompt.trim();
  const hasQuestionIntent = containsAny(normalized, [
    /^(为什么|为何|怎么|如何|哪里|在哪|能不能解释|请解释|分析一下|看看|查一下)/i,
    /(是什么|有什么区别|原因|怎么看|如何验证|怎么验证|是否|有没有|\?)$/i
  ]);
  return hasQuestionIntent && detectChangeKind(normalized) === null;
}
function detectRisk(prompt, taskKind) {
  const normalized = prompt.trim();
  if (containsAny(normalized, [/(数据库|迁移|权限|认证|支付|安全|删除数据|生产|破坏性|高风险|回滚|schema|migration)/i])) {
    return "high";
  }
  if (taskKind === "refactor" || containsAny(normalized, [/(跨模块|架构|大范围|重构|多个项目|主路径|runtime)/i])) {
    return "medium";
  }
  return "low";
}
function classifyPrompt(prompt, hasActiveTask, allowFallbackCreate) {
  if (!prompt.trim()) {
    return {
      action: "chat",
      reason: "empty_prompt",
      taskKind: "empty",
      risk: "low"
    };
  }
  if (isHostInternalPrompt(prompt)) {
    return {
      action: "chat",
      reason: "host_internal_prompt",
      taskKind: "host_internal",
      risk: "low"
    };
  }
  if (hasActiveTask && /(继续|resume|接着|延续)/i.test(prompt)) {
    return {
      action: "resume_task",
      reason: "resume_active_task",
      taskKind: "resume",
      risk: "low"
    };
  }
  if (hasActiveTask && /(当前任务|这个任务|继续修复|继续做)/i.test(prompt)) {
    return {
      action: "resume_task",
      reason: "resume_active_task",
      taskKind: "resume",
      risk: "low"
    };
  }
  if (isQuestionOnly(prompt)) {
    return {
      action: "chat",
      reason: "matched_question_intent",
      taskKind: "question",
      risk: "low"
    };
  }
  const taskKind = detectChangeKind(prompt);
  if (taskKind) {
    return {
      action: allowFallbackCreate ? "create_task" : "delegate_to_planner",
      reason: "matched_change_intent",
      taskKind,
      risk: detectRisk(prompt, taskKind)
    };
  }
  return {
    action: allowFallbackCreate ? "create_task" : "delegate_to_planner",
    reason: "default_change_intent",
    taskKind: "code_change",
    risk: "low"
  };
}
async function runHostUserPromptSubmit(flags, positionals) {
  const workDir = process.cwd();
  const prompt = (typeof flags.prompt === "string" ? flags.prompt : "") || positionals.join(" ").trim();
  const manager = new TaskManager2();
  const config = await loadHarnessConfig2(workDir);
  const activeTaskId = await readActiveTaskId(workDir);
  const decision = classifyPrompt(
    prompt,
    Boolean(activeTaskId),
    config.fallbackCreateTaskWithoutPlanner
  );
  const { action } = decision;
  await appendHarnessEvent(workDir, {
    type: "host.intake_decision",
    host: config.defaultHost,
    action,
    reason: decision.reason,
    taskKind: decision.taskKind,
    risk: decision.risk,
    activeTaskId,
    plannerAgent: action === "delegate_to_planner" ? "harness-planner" : void 0,
    taskCreated: false
  });
  if (action === "create_task") {
    const ctx = await manager.create(prompt, workDir);
    const engine = new WorkflowEngine(manager);
    await engine.run(ctx, {
      adapterKind: ctx.config.adapterKind,
      adapterCommand: ctx.config.adapterCommand,
      dryRun: true
    });
    await appendHarnessEvent(workDir, {
      type: "host.task_created",
      host: config.defaultHost,
      action,
      activeTaskId: ctx.taskId,
      taskCreated: true,
      contractPath: `${ctx.taskDir}/contract.yaml`,
      planPath: `${ctx.taskDir}/plan.md`
    });
    printJson({
      prompt,
      activeTaskId: ctx.taskId,
      action,
      reason: decision.reason,
      taskKind: decision.taskKind,
      risk: decision.risk,
      taskCreated: true,
      taskId: ctx.taskId,
      contractPath: `${ctx.taskDir}/contract.yaml`,
      planPath: `${ctx.taskDir}/plan.md`,
      nextStep: "review_contract_and_plan"
    });
    return;
  }
  printJson({
    prompt,
    activeTaskId,
    action,
    reason: decision.reason,
    taskKind: decision.taskKind,
    risk: decision.risk,
    taskCreated: false,
    plannerAgent: action === "delegate_to_planner" ? "harness-planner" : void 0,
    fallbackCreateTaskWithoutPlanner: config.fallbackCreateTaskWithoutPlanner,
    nextStep: action === "resume_task" ? "resume_existing_task" : action === "delegate_to_planner" ? "delegate_to_planner" : "no_action"
  });
}

// src/commands/eval.ts
import { collectEvidence, createTaskReport, evaluateCommitGate, TaskManager as TaskManager3 } from "@harnessly/core";
function createEvalOnlyAdapter() {
  return {
    kind: "custom",
    command: "eval-only",
    exitCode: 0,
    stdout: "",
    stderr: ""
  };
}
async function runEval(flags, positionals) {
  const workDir = process.cwd();
  const manager = new TaskManager3();
  const requestedTaskId = (typeof flags["task-id"] === "string" ? flags["task-id"] : "") || (positionals[0] ?? "").trim();
  const taskId = requestedTaskId || await manager.getLatestTaskId(workDir);
  if (!taskId) {
    throw new Error("\u6CA1\u6709\u53EF\u91CD\u9A8C\u8BC1\u7684 task\u3002\u8BF7\u5148\u6267\u884C harnessly run\u3002");
  }
  const ctx = await manager.resume(taskId, workDir);
  const previousReport = await manager.loadReport(taskId, workDir);
  ctx.state.status = "verifying";
  ctx.state.currentStage = "eval";
  await manager.saveState(ctx);
  const evidence = await collectEvidence(workDir, ctx.config, ctx.contract);
  const adapter = previousReport?.adapter ?? createEvalOnlyAdapter();
  const commitGate = evaluateCommitGate(evidence, adapter.exitCode);
  const report = createTaskReport(ctx, adapter, evidence, commitGate);
  await manager.saveReport(ctx, report);
  await appendHarnessEvent(workDir, {
    type: "eval.report_written",
    taskId: ctx.taskId,
    reportPath: `${ctx.taskDir}/report.json`,
    commitReady: report.commitReady
  });
  printLines([
    report.commitReady ? "\u91CD\u9A8C\u8BC1\u5B8C\u6210\uFF0Ccommit gate \u901A\u8FC7" : "\u91CD\u9A8C\u8BC1\u5B8C\u6210\uFF0C\u4F46 commit gate \u672A\u901A\u8FC7",
    `- task_id: ${ctx.taskId}`,
    `- report: ${ctx.taskDir}/report.json`,
    `- changed_files: ${report.evidence.changedFiles.length > 0 ? report.evidence.changedFiles.join(", ") : "none"}`,
    `- commit_ready: ${report.commitReady}`
  ]);
}

// src/commands/list.ts
import { TaskManager as TaskManager4 } from "@harnessly/core";
async function runList(flags) {
  const manager = new TaskManager4();
  const workDir = process.cwd();
  const [tasks, activeTaskId] = await Promise.all([
    manager.listTasks(workDir),
    readActiveTaskId(workDir)
  ]);
  if (flags.json === true) {
    printJson({
      activeTaskId,
      tasks
    });
    return;
  }
  if (tasks.length === 0) {
    printLines(["Tasks", '- \u5F53\u524D\u6CA1\u6709 task\u3002\u5148\u6267\u884C harnessly run "<goal>" \u521B\u5EFA\u4EFB\u52A1\u3002']);
    return;
  }
  printLines([
    "Tasks",
    ...tasks.map(
      (task) => `- ${task.taskId}${task.taskId === activeTaskId ? " [active]" : ""}: status=${task.status}, stage=${task.currentStage}, retry=${task.retryCount}, updated_at=${task.updatedAt}, goal=${task.goal}`
    )
  ]);
}

// src/commands/retry.ts
import { TaskManager as TaskManager5, WorkflowEngine as WorkflowEngine2 } from "@harnessly/core";
async function runRetry(flags, positionals) {
  const workDir = process.cwd();
  const manager = new TaskManager5();
  const requestedTaskId = (typeof flags["task-id"] === "string" ? flags["task-id"] : "") || (positionals[0] ?? "").trim();
  const taskId = requestedTaskId || await manager.getLatestTaskId(workDir);
  if (!taskId) {
    throw new Error("\u6CA1\u6709\u53EF\u91CD\u8BD5\u7684 task\u3002\u8BF7\u5148\u6267\u884C harnessly run\u3002");
  }
  const ctx = await manager.resume(taskId, workDir);
  if (!ctx.contract || !ctx.plan) {
    throw new Error(`task ${taskId} \u7F3A\u5C11 contract \u6216 plan\uFF0C\u4E0D\u80FD\u4ECE execute \u9636\u6BB5\u91CD\u8BD5`);
  }
  const adapterKind = typeof flags.adapter === "string" ? flags.adapter : ctx.config.adapterKind;
  const adapterCommand = (typeof flags["adapter-command"] === "string" ? flags["adapter-command"] : ctx.config.adapterCommand) || "";
  const engine = new WorkflowEngine2(manager);
  const result = await engine.run(ctx, {
    adapterKind,
    adapterCommand,
    dryRun: false,
    resumeFrom: "execute"
  });
  if (!result.report) {
    throw new Error("retry \u672A\u751F\u6210 report");
  }
  printLines([
    result.report.commitReady ? "\u4EFB\u52A1\u91CD\u8BD5\u5B8C\u6210\uFF0Ccommit gate \u901A\u8FC7" : "\u4EFB\u52A1\u91CD\u8BD5\u7ED3\u675F\uFF0C\u4F46 commit gate \u672A\u901A\u8FC7",
    `- task_id: ${ctx.taskId}`,
    `- retry_count: ${ctx.state.retryCount}`,
    `- report: ${ctx.taskDir}/report.json`,
    `- commit_ready: ${result.report.commitReady}`
  ]);
}

// src/commands/run.ts
import {
  TaskManager as TaskManager6,
  WorkflowEngine as WorkflowEngine3
} from "@harnessly/core";

// src/utils/interaction.ts
import { createInterface } from "readline/promises";
function shouldAutoConfirm(flags, streams = {
  input: process.stdin,
  output: process.stdout,
  env: process.env
}) {
  if (flags["skip-confirm"] === true) {
    return true;
  }
  if (streams.env.CI === "true") {
    return true;
  }
  return streams.input.isTTY !== true || streams.output.isTTY !== true;
}
function normalizeConfirmationAnswer(answer) {
  const normalized = answer.trim().toLowerCase();
  if (normalized === "y" || normalized === "yes") {
    return true;
  }
  if (normalized === "n" || normalized === "no") {
    return false;
  }
  return null;
}
async function confirmContract(summary, flags, streams = {
  input: process.stdin,
  output: process.stdout,
  env: process.env
}) {
  if (shouldAutoConfirm(flags, streams)) {
    return true;
  }
  printLines([
    "Contract \u5F85\u786E\u8BA4",
    `- task_id: ${summary.taskId}`,
    `- goal: ${summary.goal}`,
    `- template: ${summary.templateName}`,
    `- contract: ${summary.contractPath}`,
    `- plan: ${summary.planPath}`
  ]);
  const readline = createInterface({
    input: streams.input,
    output: streams.output
  });
  try {
    while (true) {
      const answer = normalizeConfirmationAnswer(
        await readline.question("\u786E\u8BA4 contract \u4E0E plan\uFF1F(y/n) ")
      );
      if (answer !== null) {
        return answer;
      }
      streams.output.write("\u8BF7\u8F93\u5165 y \u6216 n\u3002\n");
    }
  } finally {
    readline.close();
  }
}

// src/commands/run.ts
function normalizeGoal(positionals, flags) {
  if (typeof flags.goal === "string" && flags.goal.trim()) {
    return flags.goal.trim();
  }
  return positionals.join(" ").trim();
}
async function runTask(flags, positionals) {
  const workDir = process.cwd();
  const manager = new TaskManager6();
  if (typeof flags.resume === "string" && flags.resume.trim()) {
    const ctx2 = await manager.resume(flags.resume.trim(), workDir);
    printLines([
      "\u4EFB\u52A1\u5DF2\u6062\u590D",
      `- task_id: ${ctx2.taskId}`,
      `- goal: ${ctx2.goal}`,
      `- status: ${ctx2.state.status}`,
      `- current_stage: ${ctx2.state.currentStage}`,
      `- retry_count: ${ctx2.state.retryCount}`,
      `- last_failure: ${ctx2.state.lastFailureReason ?? "none"}`
    ]);
    return;
  }
  const goal = normalizeGoal(positionals, flags);
  if (!goal) {
    throw new Error('\u7F3A\u5C11 goal\u3002\u7528\u6CD5\uFF1Aharnessly run --dry-run "<goal>"');
  }
  const ctx = await manager.create(goal, workDir);
  const isDryRun = flags["dry-run"] === true;
  const adapterKind = typeof flags.adapter === "string" ? flags.adapter : ctx.config.adapterKind;
  const adapterCommand = (typeof flags["adapter-command"] === "string" ? flags["adapter-command"] : ctx.config.adapterCommand) || "";
  const engine = new WorkflowEngine3(manager);
  await engine.run(ctx, {
    adapterKind,
    adapterCommand,
    dryRun: true
  });
  const confirmed = await confirmContract(
    {
      taskId: ctx.taskId,
      goal: ctx.goal,
      templateName: ctx.contract?.templateName ?? "unknown",
      contractPath: `${ctx.taskDir}/contract.yaml`,
      planPath: `${ctx.taskDir}/plan.md`
    },
    flags
  );
  if (!confirmed) {
    printLines([
      "contract \u672A\u786E\u8BA4\uFF0C\u4EFB\u52A1\u5DF2\u4FDD\u7559",
      `- task_id: ${ctx.taskId}`,
      `- contract: ${ctx.taskDir}/contract.yaml`,
      `- plan: ${ctx.taskDir}/plan.md`,
      `- status: ${ctx.state.status}`
    ]);
    return;
  }
  if (isDryRun) {
    printLines([
      "dry-run \u5DF2\u751F\u6210 contract \u4E0E plan",
      `- task_id: ${ctx.taskId}`,
      `- template: ${ctx.contract?.templateName ?? "unknown"}`,
      `- contract: ${ctx.taskDir}/contract.yaml`,
      `- plan: ${ctx.taskDir}/plan.md`,
      `- confirmed: true`,
      `- status: ${ctx.state.status}`
    ]);
    return;
  }
  const result = await engine.run(ctx, {
    adapterKind,
    adapterCommand,
    dryRun: false,
    resumeFrom: "plan"
  });
  if (!result.dryRun && result.report) {
    printLines([
      result.report.commitReady ? "\u4EFB\u52A1\u6267\u884C\u5B8C\u6210\uFF0Ccommit gate \u901A\u8FC7" : "\u4EFB\u52A1\u6267\u884C\u7ED3\u675F\uFF0C\u4F46 commit gate \u672A\u901A\u8FC7",
      `- task_id: ${ctx.taskId}`,
      `- adapter: ${adapterKind}`,
      `- report: ${ctx.taskDir}/report.json`,
      `- changed_files: ${result.report.evidence.changedFiles.length > 0 ? result.report.evidence.changedFiles.join(", ") : "none"}`,
      `- commit_ready: ${result.report.commitReady}`
    ]);
    return;
  }
}

// src/commands/status.ts
import { TaskManager as TaskManager7 } from "@harnessly/core";
function resolveRequestedTaskId(flags, positionals) {
  if (typeof flags["task-id"] === "string" && flags["task-id"].trim()) {
    return flags["task-id"].trim();
  }
  return (positionals[0] ?? "").trim();
}
async function runStatus(flags, positionals) {
  const workDir = process.cwd();
  const manager = new TaskManager7();
  const requestedTaskId = resolveRequestedTaskId(flags, positionals);
  const [activeTaskId, latestTaskId, hosts] = await Promise.all([
    readActiveTaskId(workDir),
    manager.getLatestTaskId(workDir),
    collectHostStatus(workDir)
  ]);
  const selectedTaskId = requestedTaskId || activeTaskId || latestTaskId;
  if (!selectedTaskId) {
    if (flags.json === true) {
      printJson({
        activeTaskId,
        selectedTaskId: null,
        task: null,
        hosts
      });
      return;
    }
    printLines([
      "\u4EFB\u52A1\u72B6\u6001",
      '- \u5F53\u524D\u6CA1\u6709 task\u3002\u5148\u6267\u884C harnessly run "<goal>" \u521B\u5EFA\u4EFB\u52A1\u3002',
      ...hosts.map(
        (host) => `- host ${host.host}: manifest=${host.manifest}, shell=${host.shell}, files=${host.files.length > 0 ? host.files.join(", ") : "none"}`
      )
    ]);
    return;
  }
  const [ctx, report] = await Promise.all([
    manager.load(selectedTaskId, workDir),
    manager.loadReport(selectedTaskId, workDir)
  ]);
  const task = {
    taskId: ctx.taskId,
    goal: ctx.goal,
    status: ctx.state.status,
    currentStage: ctx.state.currentStage,
    retryCount: ctx.state.retryCount,
    contractReady: Boolean(ctx.contract),
    planReady: Boolean(ctx.plan),
    reportReady: report !== null,
    commitReady: report?.commitReady ?? null,
    changedFiles: report?.evidence.changedFiles ?? [],
    lastFailureStage: ctx.state.lastFailureStage ?? null,
    lastFailureReason: ctx.state.lastFailureReason ?? null,
    updatedAt: ctx.state.updatedAt
  };
  if (flags.json === true) {
    printJson({
      activeTaskId,
      selectedTaskId,
      task,
      hosts
    });
    return;
  }
  printLines([
    "\u4EFB\u52A1\u72B6\u6001",
    `- selected_task: ${selectedTaskId}`,
    `- active_task: ${activeTaskId ?? "none"}`,
    `- goal: ${task.goal}`,
    `- status: ${task.status}`,
    `- current_stage: ${task.currentStage}`,
    `- retry_count: ${task.retryCount}`,
    `- contract_ready: ${task.contractReady}`,
    `- plan_ready: ${task.planReady}`,
    `- report_ready: ${task.reportReady}`,
    `- commit_ready: ${task.commitReady ?? "unknown"}`,
    `- changed_files: ${task.changedFiles.length > 0 ? task.changedFiles.join(", ") : "none"}`,
    `- last_failure_stage: ${task.lastFailureStage ?? "none"}`,
    `- last_failure: ${task.lastFailureReason ?? "none"}`,
    `- updated_at: ${task.updatedAt}`,
    ...hosts.map(
      (host) => `- host ${host.host}: manifest=${host.manifest}, shell=${host.shell}, files=${host.files.length > 0 ? host.files.join(", ") : "none"}`
    )
  ]);
}

// src/commands/template-promote.ts
import { createTemplateDraft, deriveTemplateName, saveTemplateDraft, TaskManager as TaskManager8 } from "@harnessly/core";
async function runTemplatePromote(flags, positionals) {
  const workDir = process.cwd();
  const manager = new TaskManager8();
  const requestedTaskId = (typeof flags["task-id"] === "string" ? flags["task-id"] : "") || (positionals[0] ?? "").trim();
  const taskId = requestedTaskId || await manager.getLatestTaskId(workDir);
  if (!taskId) {
    throw new Error("\u6CA1\u6709\u53EF\u63D0\u5347\u4E3A\u6A21\u677F\u7684 task\u3002\u8BF7\u5148\u6267\u884C harnessly run\u3002");
  }
  const ctx = await manager.load(taskId, workDir);
  const report = await manager.loadReport(taskId, workDir);
  if (!ctx.contract) {
    throw new Error(`task ${taskId} \u7F3A\u5C11 contract.yaml\uFF0C\u4E0D\u80FD\u63D0\u5347\u6A21\u677F`);
  }
  if (!report) {
    throw new Error(`task ${taskId} \u7F3A\u5C11 report.json\uFF0C\u4E0D\u80FD\u63D0\u5347\u6A21\u677F`);
  }
  if (!report.commitReady) {
    throw new Error(`task ${taskId} \u672A\u901A\u8FC7 commit gate\uFF0C\u4E0D\u80FD\u63D0\u5347\u6A21\u677F`);
  }
  const name = (typeof flags.name === "string" ? flags.name.trim() : "") || deriveTemplateName(ctx.goal);
  const template = createTemplateDraft(name, ctx.contract, report, ctx.config);
  const filePath = await saveTemplateDraft(workDir, template);
  printLines([
    "\u6A21\u677F\u63D0\u5347\u5B8C\u6210",
    `- task_id: ${taskId}`,
    `- name: ${template.name}`,
    `- template: ${filePath}`
  ]);
}

// src/utils/args.ts
var BOOLEAN_FLAGS = /* @__PURE__ */ new Set([
  "dry-run",
  "skip-confirm",
  "deep-eval",
  "json",
  "force"
]);
function parseArgs(argv) {
  const positionals = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const name = token.slice(2);
    const next = argv[index + 1];
    if (BOOLEAN_FLAGS.has(name) || !next || next.startsWith("--")) {
      flags[name] = true;
      continue;
    }
    flags[name] = next;
    index += 1;
  }
  return { positionals, flags };
}

// src/run-cli.ts
function printUsage() {
  process.stdout.write(
    [
      "Usage:",
      "  harnessly init [--host claude-code|codex|gemini-cli] [--force]",
      "  harnessly eval [task-id]",
      "  harnessly list [--json]",
      "  harnessly status [task-id] [--json]",
      '  harnessly retry [task-id] [--adapter custom|codex --adapter-command "<cmd>"]',
      '  harnessly run --dry-run [--skip-confirm] "<goal>"',
      "  harnessly run --resume <task-id>",
      '  harnessly run [--skip-confirm] --adapter custom|codex --adapter-command "<cmd>" "<goal>"',
      "  harnessly template promote [task-id] [--name <template-name>]",
      "  harnessly host install [--host auto|all|claude-code|codex|gemini-cli]",
      "  harnessly host status [--json]",
      "  harnessly host sync [--host auto|all|claude-code|codex|gemini-cli]",
      "  harnessly host session-start",
      '  harnessly host user-prompt-submit [--prompt "..."]',
      '  harnessly host completion-gate [--message "..."]',
      "  harnessly host agent-event --agent harness-planner|harness-evaluator [--event started|completed] [--task-id <task-id>] [--model <model>]"
    ].join("\n") + "\n"
  );
}
async function runCli(argv) {
  const parsed = parseArgs(argv);
  const [command, subcommand, ...rest] = parsed.positionals;
  if (!command || command === "--help" || command === "help") {
    printUsage();
    return;
  }
  if (command === "init") {
    await runInit(parsed.flags);
    return;
  }
  if (command === "list") {
    await runList(parsed.flags);
    return;
  }
  if (command === "status") {
    await runStatus(parsed.flags, [subcommand, ...rest].filter(Boolean));
    return;
  }
  if (command === "eval") {
    await runEval(parsed.flags, [subcommand, ...rest].filter(Boolean));
    return;
  }
  if (command === "run") {
    await runTask(parsed.flags, [subcommand, ...rest].filter(Boolean));
    return;
  }
  if (command === "retry") {
    await runRetry(parsed.flags, [subcommand, ...rest].filter(Boolean));
    return;
  }
  if (command === "template" && subcommand === "promote") {
    await runTemplatePromote(parsed.flags, rest);
    return;
  }
  if (command === "host") {
    switch (subcommand) {
      case "install":
        await runHostInstall(parsed.flags);
        return;
      case "status":
        await runHostStatus(parsed.flags);
        return;
      case "sync":
        await runHostSync(parsed.flags);
        return;
      case "session-start":
        await runHostSessionStart();
        return;
      case "user-prompt-submit":
        await runHostUserPromptSubmit(parsed.flags, rest);
        return;
      case "completion-gate":
        await runHostCompletionGate(parsed.flags, rest);
        return;
      case "agent-event":
        await runHostAgentEvent(parsed.flags, rest);
        return;
      default:
        printUsage();
        return;
    }
  }
  printUsage();
}

// src/index.ts
function getCliRuntimeSummary() {
  return {
    packageName: "@harnessly/cli",
    version: "0.0.0",
    core: getCorePackageInfo()
  };
}
function formatCliError(error) {
  if (error instanceof Error) {
    const errorWithDetails = error;
    const pathValue = typeof errorWithDetails.path === "string" ? errorWithDetails.path : void 0;
    const isHarnessConfigMissing = errorWithDetails.code === "ENOENT" && (pathValue?.includes(".harness/harness.config.yaml") || error.message.includes(".harness/harness.config.yaml"));
    if (isHarnessConfigMissing) {
      return "\u5F53\u524D\u4ED3\u5E93\u5C1A\u672A\u521D\u59CB\u5316 Harnessly\u3002\u5148\u6267\u884C harnessly init\u3002";
    }
    return error.message;
  }
  return String(error);
}
function isDirectExecution() {
  const entryPath = process.argv[1];
  if (!entryPath) {
    return false;
  }
  return fileURLToPath(import.meta.url) === entryPath;
}
if (isDirectExecution()) {
  runCli(process.argv.slice(2)).catch((error) => {
    const message = formatCliError(error);
    process.stderr.write(`${message}
`);
    process.exitCode = 1;
  });
}
export {
  getCliRuntimeSummary
};
