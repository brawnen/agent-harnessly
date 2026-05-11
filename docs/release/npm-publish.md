# npm 发布说明

## 目标

将 Harnessly 发布到 npm 个人 scope `@brawnen`，用户安装入口保持为 `harnessly` 命令。

## 包名

| 包 | 角色 | 是否推荐用户直接安装 |
| --- | --- | --- |
| `@brawnen/harnessly` | CLI 入口，提供 `harnessly` bin | 是 |
| `@brawnen/harnessly-core` | repo-local kernel 与主流程能力 | 否 |
| `@brawnen/harnessly-shared` | 共享类型与 schema | 否 |
| `@brawnen/harnessly-host-shared` | 宿主适配共享渲染逻辑 | 否 |
| `@brawnen/harnessly-host-codex` | Codex host adapter | 否 |
| `@brawnen/harnessly-host-claude-code` | Claude Code host adapter | 否 |

## 发布前检查

```bash
pnpm -r --if-present typecheck
pnpm -r --if-present build
pnpm -r --if-present test
pnpm -r --filter './packages/**' exec npm pack --dry-run
node packages/cli/dist/index.js --version
node packages/cli/dist/index.js host status --json
```

## 发布顺序

内部包先发布，CLI 最后发布。

```bash
pnpm --dir packages/shared publish --access public --tag alpha
pnpm --dir packages/hosts/shared publish --access public --tag alpha
pnpm --dir packages/core publish --access public --tag alpha
pnpm --dir packages/hosts/codex publish --access public --tag alpha
pnpm --dir packages/hosts/claude-code publish --access public --tag alpha
pnpm --dir packages/cli publish --access public --tag alpha
```

## 安装验证

在临时目录验证真实安装链路：

```bash
npm i -g @brawnen/harnessly@alpha
harnessly --version
harnessly init --host codex
harnessly host status --json
```

## 注意事项

- 不要发布根包；根包仍然只是 monorepo 工作区壳。
- 不要把 `harnessly run` 写成产品主路径；CLI 仍只承担 fallback、debug、CI、manual-headless 和 host command bridge。
- 如果要改成稳定版本，先统一 bump 所有 workspace 包版本，再去掉 `--tag alpha`。
