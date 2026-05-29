# npm 发布说明

## 目标

将 Harnessly 发布到 npm 个人 scope `@brawnen`，用户安装入口为 `harnessly` 命令。

**只发布一个包：`@brawnen/harnessly`（CLI）。** 其余 workspace 包是 monorepo 内部模块，在构建时被 tsup 全量 bundle 进 CLI 的 `dist/index.js`，不单独发布。

## 为什么是单包

CLI 的 `tsup.config.ts` 配了 `noExternal: [/@brawnen/]`，构建时把所有 `@brawnen/harnessly-*` workspace 包内联进 `packages/cli/dist/index.js`（单文件 ~235KB）。因此：

- `@brawnen/harnessly-core` / `-shared`：`private: true`，不发布
- `@brawnen/harnessly-host-*`：被 bundle，无需单独发布
- 消费者 `npm i -g @brawnen/harnessly` 只拿到这一个自包含包，没有 workspace 依赖解析问题

> 历史上曾计划多包分离发布（内部包先发、CLI 后发、用 `pnpm pack` 改写 `workspace:*`）。现已废弃 —— 单包自包含发布更简单，且无 `workspace:*` 改写需求（CLI 的 `dependencies` 不含 workspace 包，它们都在 `devDependencies`）。

## 运行时依赖

CLI 发布后消费者实际安装的依赖（`packages/cli/package.json` 的 `dependencies`）：

| 依赖 | 用途 |
| --- | --- |
| `zod` | schema 校验 |
| `zod-to-json-schema` | schema 转换 |
| `@anthropic-ai/sdk` | LLM 调用（contract 生成等）。在 `llm.ts` 顶层 static import，是 CLI 启动必需，故归 `dependencies`（不是 `optionalDependencies`） |

`@anthropic-ai/sdk` 在 tsup `external` 中（不 bundle），运行时从消费者 `node_modules` 解析，因此必须在 `dependencies` 中声明。

## 发布前检查

```bash
# 全量验证（monorepo 内所有包，确保 bundle 来源正确）
pnpm typecheck
pnpm test
pnpm build

# CLI 产物自检
node packages/cli/dist/index.js --version
node packages/cli/dist/index.js host status --json

# tarball 内容抽查：确认只含 dist + package.json，且 dependencies 无 workspace:*
cd packages/cli && npm pack --dry-run
```

`npm pack --dry-run` 输出应只包含 `dist/` 与 `package.json`；`dependencies` 中不应出现任何 `@brawnen/*` 或 `workspace:*`。

## 版本号

CLI 版本在 `packages/cli/package.json`。bump：

```bash
pnpm version:alpha        # = cd packages/cli && npm version prerelease --preid alpha
```

注意 npm 不允许重复发布同一版本号，发布前确认 `packages/cli/package.json` 的 `version` 未被占用：

```bash
npm view @brawnen/harnessly versions
```

## 发布

```bash
pnpm publish:alpha        # = cd packages/cli && npm publish --tag alpha
```

CLI 的 `prepublishOnly` 会自动 `pnpm build`，确保发布的 `dist` 为最新。`publishConfig.access` 已设为 `public`，无需额外 `--access` 参数。

## 安装验证

发布后在干净环境验证真实安装链路：

```bash
# 临时目录纯净安装（不要用本地 link / cp，必须验证真实 npm 包）
mkdir -p /tmp/harnessly-verify && cd /tmp/harnessly-verify
npm init -y
npm i @brawnen/harnessly@alpha

# 关键验证点
ls node_modules/@anthropic-ai/sdk          # 必需依赖被装上
node node_modules/@brawnen/harnessly/dist/index.js --version

# 或全局安装验证
npm i -g @brawnen/harnessly@alpha
harnessly --version
harnessly init --host codex
harnessly host status --json
```

## 注意事项

- **只发 `@brawnen/harnessly` 一个包**，不发根包、不发内部包。
- 不要把 `harnessly run` 写成产品主路径；CLI 只承担 fallback、debug、CI、manual-headless 与 host command bridge。Host-first 才是主路径。
- 改为稳定版本时：bump `packages/cli/package.json` 版本去掉 alpha preid，发布时去掉 `--tag alpha`。
- 开发期若用本地 dist 顶替全局（`cp packages/cli/dist/index.js` 到全局安装路径），记得这只是临时手段，正式验证必须走纯净 `npm i`。
