# VS Code 扩展改造分步计划（基于 `docs/extention/init_plan.md`）

目标：将现有 `tmux-ai-cli`（`bin/ai` + `bin/ai-tmux`）升级为生产级 VS Code 扩展 `vscode-tmux-ai`，实现 Multi-Session / Multi-Client / Passive Sync / Rehydration + Zombie Handling，并以 **`--json` 唯一通信协议** 作为扩展与 CLI 的契约。

> 说明：本文件是“可执行的 PR 拆解计划”。每一步都应保持可运行、可回滚、可验证。

---

## Step 0：基线梳理（只读，不改行为）

**目标**
- 明确现有命名规则、tmux session 映射、以及 `ai-types.yaml` 类型字段。
- 固化“terminal 命名格式兼容性”为可测试规范（避免后续 Rehydration 各写各的）。

**涉及文件（只读）**
- `bin/ai`
- `bin/ai-tmux`
- `config/ai-types.yaml`
- `vscode/settings.json`（旧配置，仅参考）
- `vscode/keybindings.json`（旧配置，仅参考）

**产出**
- 在后续实现中固定：`sessionPrefix=ai`、`tmux server socket=-L ai`、`master=ai-master` 的处理策略。
- 追加一份可复用的“命名兼容规范”（二选一即可）：
  - 新增文档 `docs/extention/naming_compat.md`（格式样例表 + 正则/解析规则），或
  - 在后续 `packages/vscode-tmux-ai/src/terminal/naming.ts` 的单元测试里固化旧格式与新格式的 parse 行为。

---

## Step 1：CLI Modernization（JSON Contract + Version + Atomic + Validation）

**目标**
- 扩展侧只依赖 CLI 的 `--json` 输出，且所有 JSON 响应包含 `protocolVersion=1`。
- 覆盖 `ai list/new/attach/rename/kill`（可选 `detach-all`）并提供稳定错误码。
- `new` 并发安全（避免重复 shortName），优先采用“创建失败重试”的原子策略。
- 双端（CLI+TS）统一 shortName 校验：仅允许 `[a-zA-Z0-9_-]+`。

**关键约定（补充防坑）**
- 握手触发点：扩展启动后的第一次 `ai list --json` 即 handshake，必须携带 `protocolVersion`。
- 不兼容策略：版本不匹配进入 degraded mode，至少禁用 `new/attach/rename/kill/detach-all`，仅保留“刷新/打开设置/查看错误提示”。
- 字段映射固定：
  - `shortName = {type}-{n|slug}`
  - `tmuxSession = {sessionPrefix}-{shortName}`（如 `ai-claude-1`）
  - CLI **所有入参只接受 `shortName`**，输出永远同时包含 `name/shortName/tmuxSession`（TS 端不猜、不拼接隐式规则）。
- stdout 纯净：stdout 仅输出 JSON；debug/log 全部走 stderr；runner 只 parse stdout。
- JSON 生成稳健：无 `jq` 时优先 `python3 -c 'import json; ...'`；纯 bash 必须至少对 `\\` 与 `"` 做最小转义。

**改动文件**
- 修改：`bin/ai`（新增 `--json` 分支；保留原有人类可读输出与交互行为）
- 修改：`bin/ai-tmux`（补齐 list/new/rename/kill 的底层能力；提供 attachedClients 统计能力）
- 修改/校对：`config/ai-types.yaml`（确保 typeId/label/icon/base_color/desc 字段可合并输出）
- 新增：`docs/cli-contract.md`（字段说明、示例、错误码、protocolVersion 约定）
- 新增：`scripts/smoke_concurrency.sh`（并发 20 次 `ai new --json --type claude`，验证唯一性与成功率）

**验收标准**
- `ai list --json` 输出 `types` + `sessions[]`，每个 session 含 `name/shortName/type/tmuxSession/attachedClients/created/lastUsed`（至少前 5 个字段齐全）。
- 任何 error 输出 `{ ok:false, protocolVersion:1, code, message, hint? }`，且不掺杂人类文本。
- `ai new --json` 在并发下不产生重复 shortName（推荐：`tmux new-session` 已存在则 n++ 重试，附带超时/上限）。
- 并发 smoke：20 次并发 new 都成功，且 stdout 仅 JSON（stderr 可有警告）。

---

## Step 2：Extension Scaffold（目录骨架 + 配置项 + CLI 探测）

**目标**
- 初始化 `vscode-tmux-ai` 扩展工程（TypeScript）。
- 完整定义配置 schema（不自由发挥），并提供 CLI 探测/选择能力（写入用户 settings，但不修改全局外观配置）。
- Remote/WSL 友好：所有探测与执行基于 Extension Host 所在环境（而不是本地 UI 客户端）。

**改动文件（建议新目录）**
- 新增目录：`packages/vscode-tmux-ai/`（避免与旧 `vscode/` 目录混淆）
- 新增：`packages/vscode-tmux-ai/package.json`（contributes：views/commands/menus/configuration）
- 新增：`packages/vscode-tmux-ai/tsconfig.json`
- 新增：`packages/vscode-tmux-ai/src/extension.ts`（activate/deactivate 基础骨架）
- 新增：`packages/vscode-tmux-ai/src/config.ts`（读取/校验配置）
- （如需）新增：`packages/vscode-tmux-ai/.vscode/launch.json`（本地调试）

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
- 在 Remote/WSL 下，`cliPath` 探测与执行均指向远端路径，且不会因为本地/远端路径差异崩溃。

---

## Step 3：CliRunner（execFile 封装 + JSON 解析 + Handshake）

**目标**
- 所有与 CLI 的交互走单一封装：超时、stderr 捕获、JSON parse、错误边界统一处理。
- 首次 list/new 等关键操作前完成 `protocolVersion` 检查；不兼容进入 degraded mode（禁用危险操作并提示更新 CLI）。
- Refresh/list 做 single-flight：同一时刻只跑一个 list（Passive Sync/手动 refresh/rehydration 复用同一个 Promise）。
- 长操作具备超时/取消语义（至少 UI 可取消或在超时后给出明确错误）。

**改动文件**
- 新增：`packages/vscode-tmux-ai/src/cli/runner.ts`
- 新增：`packages/vscode-tmux-ai/src/cli/protocol.ts`（TS 类型 + 错误码映射）
- 修改：`packages/vscode-tmux-ai/src/extension.ts`（接入 runner，集中处理 handshake）

**验收标准**
- CLI 输出非 JSON / 版本不匹配时，扩展提示用户更新 CLI（例如运行 `install.sh`），且不会误解析文本导致异常行为。
- CLI 返回非 JSON 时：扩展不崩溃、进入 degraded mode，且提示信息可定位问题（stderr 作为补充信息）。

---

## Step 4：Tree View（分组 + Inline Actions + Passive Sync）

**目标**
- Activity Bar 新容器 “Tmux AI”，Tree 结构：Type -> Sessions。
- Session 节点显示 clients 状态、lastUsed，并通过 hash(shortName) 派生实例色，增强区分度。
- `onDidChangeWindowState` focused 时静默刷新（带 debounce 500~1500ms），可配置开关。
- 在本步末尾引入“最小 Rehydration”（仅扫描 terminals 建映射 + Connect 优先复用），保证 Reload Window 后 Connect 不重复开 Tab；完整 Zombie 交叉验证仍放 Step 5。
- （可选增强，非主线阻塞）增加“文件触发 refresh”通道：CLI touch `~/.cache/tmux-ai/state.json`（或 `.state` 文件），扩展监听变更并触发 refresh。

**改动文件**
- 新增：`packages/vscode-tmux-ai/src/tree/provider.ts`
- 新增：`packages/vscode-tmux-ai/src/tree/items.ts`
- 修改：`packages/vscode-tmux-ai/package.json`（views/menus/commands）

**验收标准**
- Tree 能展示 `ai list --json` 的 types/sessions。
- 每个 Session 有行内按钮：Connect / New Client / Rename / Kill（至少先占位可点击）。
- 窗口失焦再聚焦：Tree 自动刷新且不闪烁（single-flight 生效）。

---

## Step 5：TerminalManager（Rehydration + Cross Validation + Zombie Handling + Smart Focus）

**目标**
- activate() 阶段扫描 `vscode.window.terminals`，解析 terminal.name 恢复映射。
- 与 `ai list --json` 交叉验证，并精确定义两类“孤儿”：
  - Orphaned Terminal：有 VS Code terminal（命名符合规则），但 `ai list` 没该 session → 仅提供 Close Terminal 清理。
  - Orphaned Session：`ai list` 有 session，但 VS Code 中无 terminal → 正常允许 Connect/Attach。
- Smart Focus：默认 Connect 不重复开 tab；New Client 强制新开。
- Zombie 清理 UX：当检测到 Orphaned Terminals 时，提供“一键清理全部”入口（例如根节点扫帚按钮）。

**改动文件**
- 新增：`packages/vscode-tmux-ai/src/terminal/manager.ts`
- 新增：`packages/vscode-tmux-ai/src/terminal/naming.ts`（nameFormat 解析/兼容旧格式；regex 必须 anchor ^$）
- 修改：`packages/vscode-tmux-ai/src/extension.ts`（activate 时调用 rehydrate）

**验收标准**
- 重启 VS Code 后，已有的相关 terminals 能被识别并映射回 sessions。
- Zombie terminals 不报错、不误 attach，并可从 UI 关闭。
- 外部 `tmux kill-session` 后：对应 VS Code terminal 变为 Orphaned Terminal，Connect 被禁用但 Close 可用。

---

## Step 6：交互命令（New/Rename/Kill/Detach All）

**目标**
- New Session：QuickPick Type -> InputBox Name（可空=auto）-> 校验 -> `ai new --json` -> 自动 Connect。
- Rename/Kill/Detach All：调用 JSON CLI；必要时同步处理 VS Code terminals（重命名或重开）。
- 幂等与安全：destructive actions（Kill/Detach All）默认二次确认，允许配置关闭。

**改动文件**
- 新增：`packages/vscode-tmux-ai/src/commands/*.ts`
- 修改：`packages/vscode-tmux-ai/package.json`（commands + menus + keybindings（可选））
- 修改：`packages/vscode-tmux-ai/package.json`（新增配置 `tmuxAi.confirm.destructiveActions`，默认 `true`）

**验收标准**
- 所有用户入口都有明确的错误提示（非法 shortName / CLI 不可用 / 协议不兼容等）。
- 同一 session 连点 New Client 3 次：生成 `(2)(3)(4)` 三个终端，Tree 显示 `(3 clients)`。

---

## Step 7：打包与文档（vsix + README + FAQ）

**目标**
- `vsce package` 产出 `.vsix`，并在 README 中说明：
  - CLI 前置依赖与安装/更新
  - 配置项
  - Passive Sync 行为
  - protocolVersion 握手与常见错误排查

**改动文件**
- 新增：`packages/vscode-tmux-ai/README.md`
- （如需）新增：`packages/vscode-tmux-ai/CHANGELOG.md`
- （如需）新增：`packages/vscode-tmux-ai/.vscodeignore`

**验收标准**
- 本地可打包；安装 vsix 后 Tree/命令可用（在 CLI 可用时）。
