# VS Code 扩展改造分步计划（基于 `docs/extention/init_plan.md`）

目标：将现有 `tmux-ai-cli`（`bin/ai` + `bin/ai-tmux`）升级为生产级 VS Code 扩展 `vscode-tmux-ai`，实现 Multi-Session / Multi-Client / Passive Sync / Rehydration + Zombie Handling，并以 **`--json` 唯一通信协议** 作为扩展与 CLI 的契约。

> 说明：本文件是“可执行的 PR 拆解计划”。每一步都应保持可运行、可回滚、可验证。

---

## Step 0：基线梳理（只读，不改行为）

**目标**
- 明确现有命名规则、tmux session 映射、以及 `ai-types.yaml` 类型字段。
- 确认扩展需要兼容的旧 terminal 命名格式（用于启动 rehydration）。

**涉及文件（只读）**
- `bin/ai`
- `bin/ai-tmux`
- `config/ai-types.yaml`
- `vscode/settings.json`（旧配置，仅参考）
- `vscode/keybindings.json`（旧配置，仅参考）

**产出**
- 在后续实现中固定：`sessionPrefix=ai`、`tmux server socket=-L ai`、`master=ai-master` 的处理策略。

---

## Step 1：CLI Modernization（JSON Contract + Version + Atomic + Validation）

**目标**
- 扩展侧只依赖 CLI 的 `--json` 输出，且所有 JSON 响应包含 `protocolVersion=1`。
- 覆盖 `ai list/new/attach/rename/kill`（可选 `detach-all`）并提供稳定错误码。
- `new` 并发安全（避免重复 shortName）。
- 双端（CLI+TS）统一 shortName 校验：仅允许 `[a-zA-Z0-9_-]+`。

**改动文件**
- 修改：`bin/ai`（新增 `--json` 分支；保留原有人类可读输出与交互行为）
- 修改：`bin/ai-tmux`（补齐 list/new/rename/kill 的底层能力；提供 attachedClients 统计能力）
- 修改/校对：`config/ai-types.yaml`（确保 typeId/label/icon/base_color/desc 字段可合并输出）
- 新增：`docs/cli-contract.md`（字段说明、示例、错误码、protocolVersion 约定）
- 新增：`scripts/smoke_concurrency.sh`（并发 20 次 `ai new --json --type claude`，验证唯一性与成功率）

**验收标准**
- `ai list --json` 输出 `types` + `sessions[]`，每个 session 含 `name/shortName/type/tmuxSession/attachedClients/created/lastUsed`（至少前 5 个字段齐全）。
- 任何 error 输出 `{ ok:false, protocolVersion:1, code, message, hint? }`，且不掺杂人类文本。
- `ai new --json` 在并发下不产生重复 shortName（可用“创建失败则 n++ 重试”或“锁+自旋+超时”实现）。

---

## Step 2：Extension Scaffold（目录骨架 + 配置项 + CLI 探测）

**目标**
- 初始化 `vscode-tmux-ai` 扩展工程（TypeScript）。
- 完整定义配置 schema（不自由发挥），并提供 CLI 探测/选择能力（写入用户 settings，但不修改全局外观配置）。

**改动文件（建议新目录）**
- 新增目录：`vscode-tmux-ai/`
- 新增：`vscode-tmux-ai/package.json`（contributes：views/commands/menus/configuration）
- 新增：`vscode-tmux-ai/tsconfig.json`
- 新增：`vscode-tmux-ai/src/extension.ts`（activate/deactivate 基础骨架）
- 新增：`vscode-tmux-ai/src/config.ts`（读取/校验配置）
- （如需）新增：`vscode-tmux-ai/.vscode/launch.json`（本地调试）

**配置键（与 init_plan 对齐）**
- `tmuxAi.cliPath`
- `tmuxAi.discovery.searchPaths`
- `tmuxAi.namingPattern`
- `tmuxAi.passiveSync.enabled`
- `tmuxAi.terminal.nameFormat`
- `tmuxAi.terminal.multiClientNameFormat`
- `tmuxAi.terminal.useProfileFallback`
- `tmuxAi.debug`

**验收标准**
- 扩展能在 VS Code 中启动（`F5`）并注册命令（至少 `tmuxAi.refresh`）。
- 未配置 CLI 时，会引导用户选择/填写 `tmuxAi.cliPath`（但不会改动全局 settings.json 的终端配色等）。

---

## Step 3：CliRunner（execFile 封装 + JSON 解析 + Handshake）

**目标**
- 所有与 CLI 的交互走单一封装：超时、stderr 捕获、JSON parse、错误边界统一处理。
- 首次 list/new 等关键操作前完成 `protocolVersion` 检查；不兼容进入 degraded mode（禁用危险操作并提示更新 CLI）。

**改动文件**
- 新增：`vscode-tmux-ai/src/cli/runner.ts`
- 新增：`vscode-tmux-ai/src/cli/protocol.ts`（TS 类型 + 错误码映射）
- 修改：`vscode-tmux-ai/src/extension.ts`（接入 runner，集中处理 handshake）

**验收标准**
- CLI 输出非 JSON / 版本不匹配时，扩展提示用户更新 CLI（例如运行 `install.sh`），且不会误解析文本导致异常行为。

---

## Step 4：Tree View（分组 + Inline Actions + Passive Sync）

**目标**
- Activity Bar 新容器 “Tmux AI”，Tree 结构：Type -> Sessions。
- Session 节点显示 clients 状态、lastUsed，并通过 hash(shortName) 派生实例色，增强区分度。
- `onDidChangeWindowState` focused 时静默刷新（带 debounce 500~1500ms），可配置开关。

**改动文件**
- 新增：`vscode-tmux-ai/src/tree/provider.ts`
- 新增：`vscode-tmux-ai/src/tree/items.ts`
- 修改：`vscode-tmux-ai/package.json`（views/menus/commands）

**验收标准**
- Tree 能展示 `ai list --json` 的 types/sessions。
- 每个 Session 有行内按钮：Connect / New Client / Rename / Kill（至少先占位可点击）。

---

## Step 5：TerminalManager（Rehydration + Cross Validation + Zombie Handling + Smart Focus）

**目标**
- activate() 阶段扫描 `vscode.window.terminals`，解析 terminal.name 恢复映射。
- 与 `ai list --json` 交叉验证：终端存在但 session 不在 list -> 标记为 Orphaned（Zombie），允许一键关闭。
- Smart Focus：默认 Connect 不重复开 tab；New Client 强制新开。

**改动文件**
- 新增：`vscode-tmux-ai/src/terminal/manager.ts`
- 新增：`vscode-tmux-ai/src/terminal/naming.ts`（nameFormat 解析/兼容旧格式）
- 修改：`vscode-tmux-ai/src/extension.ts`（activate 时调用 rehydrate）

**验收标准**
- 重启 VS Code 后，已有的相关 terminals 能被识别并映射回 sessions。
- Zombie terminals 不报错、不误 attach，并可从 UI 关闭。

---

## Step 6：交互命令（New/Rename/Kill/Detach All）

**目标**
- New Session：QuickPick Type -> InputBox Name（可空=auto）-> 校验 -> `ai new --json` -> 自动 Connect。
- Rename/Kill/Detach All：调用 JSON CLI；必要时同步处理 VS Code terminals（重命名或重开）。

**改动文件**
- 新增：`vscode-tmux-ai/src/commands/*.ts`
- 修改：`vscode-tmux-ai/package.json`（commands + menus + keybindings（可选））

**验收标准**
- 所有用户入口都有明确的错误提示（非法 shortName / CLI 不可用 / 协议不兼容等）。

---

## Step 7：打包与文档（vsix + README + FAQ）

**目标**
- `vsce package` 产出 `.vsix`，并在 README 中说明：
  - CLI 前置依赖与安装/更新
  - 配置项
  - Passive Sync 行为
  - protocolVersion 握手与常见错误排查

**改动文件**
- 新增：`vscode-tmux-ai/README.md`
- （如需）新增：`vscode-tmux-ai/CHANGELOG.md`
- （如需）新增：`vscode-tmux-ai/.vscodeignore`

**验收标准**
- 本地可打包；安装 vsix 后 Tree/命令可用（在 CLI 可用时）。

