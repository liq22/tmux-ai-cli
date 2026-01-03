
# Role
你是一名世界级的 VS Code 扩展专家（TypeScript/VS Code API）兼 Shell/Tmux 脚本大师。
你的任务是彻底重构并增强现有的 `tmux-ai-cli`，将其转化为一个名为 `vscode-tmux-ai` 的生产级 VS Code 扩展。
目标：提供“极致丝滑”且“健壮”的 AI 会话管理体验，支持：
- 同一类型多实例（Multi-Session）
- 同一会话多终端（Multi-Client）
- 外部状态自动同步（Passive Sync）
- 智能的启动恢复与僵尸清理（Smart Rehydration + Zombie Handling）
并确保终端视觉区分度（icon + color + instance identity）与极低侵入（默认不改全局 settings）。

# Repository Context（必须先读再动手）
请读取并理解提供的所有文件：
- `bin/ai` & `bin/ai-tmux`（核心逻辑）
- `config/ai-types.yaml`（类型定义）
- `vscode/`（旧配置，仅参考）
在输出中必须展示你修改/新增的关键代码片段（CLI + Extension）。

# Hard Constraints（不可妥协）
1) JSON Only Contract + Version Handshake：
   - 扩展与 CLI 通信必须且只能通过 `--json`，严禁解析人类可读文本。
   - 所有 JSON 响应必须包含 `protocolVersion`（int），扩展启动时检查版本；不兼容时弹窗提示更新 CLI（如运行 install.sh）。
2) Zero Global Pollution：
   - 默认绝不修改用户全局 settings.json。
   - 视觉定制优先使用 `vscode.window.createTerminal({ iconPath, color, ... })`。
   - 只有用户显式开启 fallback 时，才允许写入 workspace `.vscode/settings.json`（必须合并写入不覆盖）。
3) State Rehydration + Cross Validation + Zombie Handling：
   - activate() 阶段必须扫描现有 `vscode.window.terminals` 并恢复 Session<->Terminal 映射。
   - 必须调用 `ai list --json` 获取真实 sessions，再与扫描结果“交叉验证”。
   - 若“有 Terminal 但无 Session”（外部杀掉/过期）：标记为 Orphaned/Dead，不报错；允许用户一键关闭这些 Zombie terminals。
4) Atomic Creation：
   - CLI 的 new 必须并发安全：快速连点/并发调用不会生成重复 session 名。必须实现锁/自旋/超时（或创建失败重试方案）。
5) Passive Sync（被动同步）：
   - 监听 `vscode.window.onDidChangeWindowState`，当 `focused === true` 时自动静默刷新（触发 ai list 并更新 Tree）。
   - 必须有节流/防抖（例如 500ms~1500ms），避免频繁调用。
6) Multi-Session & Multi-Client：
   - 同一 Type 支持创建多个 Session。
   - 同一 Session 支持多 Client（多个 VS Code terminal attach），Tree View 必须直观显示 `(N clients)`。
   - 必须提供 `Detach All Clients`（优先走 CLI；无 CLI 时用“关闭所有相关 VS Code terminals + 提示 tmux detach”）。
7) Shell Args Safety：
   - CLI 必须强制校验 session shortName：仅允许 `[a-zA-Z0-9_-]+`。
   - TS 端也必须做相同校验（双保险），不合规直接拒绝 new/rename/attach（显示友好错误）。

# Product Requirements（The “Silky Smooth” Spec）

## 1) CLI 改造（The Foundation）
你必须先修改 `bin/ai` 和 `bin/ai-tmux`，实现并稳定以下 JSON 接口（扩展只依赖这些；扩展端不做文本解析）：

### 1.1 协议与版本
- 定义常量：
  - `PROTOCOL_VERSION=1`
- 所有 `--json` 输出必须包含：
  - `protocolVersion: 1`
  - `ok: true/false`
  - error 时包含：`code`、`message`、可选 `hint`

### 1.2 必需接口
- `ai list --json`
  返回（示例）：
  {
    "ok": true,
    "protocolVersion": 1,
    "types": {
      "claude": {"label":"Claude","icon":"sparkle","base_color":"terminal.ansiMagenta","desc":"Claude Code"},
      "gemini": {"label":"Gemini","icon":"globe","base_color":"terminal.ansiCyan","desc":"Gemini CLI"}
    },
    "sessions": [
      {"name":"ai-claude-1","shortName":"claude-1","type":"claude","tmuxSession":"ai-claude-1",
       "attachedClients":2,"created":"ISO8601","lastUsed":"ISO8601","windowName":"..."}
    ],
    "now":"ISO8601"
  }
  要求：
  - attachedClients 必须为 int（来自 `tmux list-clients` 统计）
  - sessions 必须包含 `shortName`（扩展 UI 与命名解析基于它）
  - types 必须从 ai-types.yaml 与用户覆盖配置合并得到

- `ai new --json --type <typeId> [--name <shortName>]`
  要求：
  - name 校验：只允许 `[a-zA-Z0-9_-]+`（短名不含空格/引号/冒号）
  - Auto Name：name 未给则生成 `{type}-{n}`，n 取最小可用正整数
  - Atomic：
    - 必须实现锁文件（如 `~/.cache/tmux-ai/lock.new`）+ 自旋重试 + 超时（例如 2s~5s）
    - 或者“尝试创建 tmux session -> 若已存在则 n++ 重试”循环，保证并发下最终唯一
  返回：
  { "ok": true, "protocolVersion": 1, "session": { ...same fields as list... } }
  或：
  { "ok": false, "protocolVersion": 1, "code":"E_NAME_TAKEN", "message":"...", "hint":"..." }

- `ai attach --json <shortName>`
  约定：CLI 负责把 shortName 映射到真实 tmux session，并输出 ok。
  返回：
  { "ok": true, "protocolVersion": 1, "exec": "..." }  # exec 可选，用于 debug

- `ai rename --json <oldShortName> <newShortName>`
  要求 newShortName 同样校验 `[a-zA-Z0-9_-]+`
  返回 ok + 新 session 信息

- `ai kill --json <shortName>`
  返回 ok

- （强烈建议）`ai detach-all --json <shortName>`
  - 若可实现：调用 tmux 让所有 client detatch / 或 kill 客户端（按安全策略）
  - 若不可实现：返回 ok:false + hint（让 VS Code 执行 close terminals）

### 1.3 JSON 输出健壮性
- 必须兼容无 jq 环境：
  - 优先：检测 python3 存在则用 python3 -c json.dumps(...) 输出
  - 否则：纯 bash 也可，但必须最小 escaping（至少对 \ 和 "）
- 文档：
  - 生成 `docs/cli-contract.md`（字段、示例、错误码、protocolVersion 说明）
- 提供 `scripts/smoke_concurrency.sh`：
  - 并发运行 20 次 `ai new --json --type claude`，确保 shortName 唯一且都成功

## 2) VS Code UX：Tree View（Sessions Explorer）
### 2.1 View Container & Tree
- Activity Bar：新增容器 “Tmux AI”
- Tree Hierarchy：
  - Level 1：Type（Claude/Gemini/Codex…）
  - Level 2：Sessions（shortName，如 claude-1）

### 2.2 Session Item（强区分度 + 多开反馈）
- Icon：ThemeIcon(type.icon)
- Color（Instance Identity，必须）：
  - 实例派生色：`hash(shortName) % 6` 映射到：
    [terminal.ansiRed, terminal.ansiGreen, terminal.ansiYellow, terminal.ansiBlue, terminal.ansiMagenta, terminal.ansiCyan]
  - Type 主色：type.base_color
  - 渲染策略：
    - TreeItem icon color 采用实例派生色
    - description 可附带 type label（如 “Claude · ...”）
- Description（必须直观）：
  - clients==0：`Idle · Last used: ...`
  - clients>0：`Attached · (${n} clients) · Last used: ...`

### 2.3 Inline Actions（Hover）
必须有以下行内图标：
- Connect（Play）：Smart Focus
- New Client（Plus/Split）：强制新建 terminal attach 同一 session
- Rename（Pencil）
- Kill（Trash）

### 2.4 Passive Sync（丝滑关键）
- 监听：`vscode.window.onDidChangeWindowState`
  - 若 `e.focused === true`：
    - 静默触发 refresh（调用 ai list）
    - 必须节流/防抖（避免频繁）
- 允许用户关闭：`tmuxAi.passiveSync.enabled`（默认 true）

### 2.5 Zombie / Orphaned UI
- Rehydration 交叉验证后若发现 orphaned terminals（终端存在但 session 不在 ai list）：
  - Tree View 允许显示一个特殊分组（例如 “Orphaned”）
  - 里面列出这些 terminals（灰色/说明 Dead）
  - 提供按钮：Close Terminal（清理）

## 3) Terminal Management Logic（The Brain）
### 3.1 Name Formats（解析与一致性）
- 配置项必须明确：
  - tmuxAi.terminal.nameFormat（default: "AI: {shortName}"）
  - tmuxAi.terminal.multiClientNameFormat（default: "AI: {shortName} ({k})"）
- 解析函数必须支持：
  - 主格式
  - 至少 1 个旧格式兼容（用于升级后的 rehydration）
- 任何无法解析的 terminal：忽略，写 debug log（不打扰用户）

### 3.2 Smart Focus（Singleton）
Connect 流程：
1) 查内存映射（sessionKey -> primary terminal）
2) 若无，遍历 vscode.window.terminals 按 Name Format 匹配
3) 命中则 show() 并写回映射
4) 未命中则 createTerminal + attach
注意：必须保证默认 Connect 不重复开 Tab。

### 3.3 Explicit Multi-Client（强制多开）
- New Client 永远 createTerminal（忽略是否已有）
- 命名：`AI: {shortName} ({k})`，k 从 2 开始递增（根据已存在同 shortName 的 terminals 计算）
- 维护 sessionKey -> all terminals 映射
- onDidCloseTerminal：清理映射

### 3.4 Rehydration + Cross Validation（启动回血 + 僵尸处理）
activate() 必须执行：
1) `ai list --json` 拉取 sessions（检查 protocolVersion）
2) 扫描 vscode.window.terminals，解析出 shortName + k
3) 交叉验证：
   - 若 terminal.shortName 存在于 sessions：建立映射（并把 smallest k / 无 k 的作为 primary）
   - 若 terminal.shortName 不在 sessions：标记为 orphaned（Zombie）
4) Zombie 处理：
   - 不允许 connect attach
   - 提供 UI 操作关闭
5) 如果 protocolVersion 不匹配：
   - showErrorMessage：提示 CLI 过旧并指导更新（install.sh / git pull）
   - 扩展进入 “degraded mode”：Tree 仍可显示基础 UI，但不执行 attach/new 等命令（或全部禁用并提示）

### 3.5 Terminal Appearance（低侵入优先）
- createTerminal 注入：
  - name
  - iconPath: ThemeIcon(type.icon)
  - color: 实例派生色（优先）
- 若 color 在当前 VS Code 版本不生效：
  - 不阻断
  - 允许用户开启 workspace profileFallback（见配置）

## 4) Interactive Flows
### 4.1 New Session（多会话创建）
- 入口：Type 分组的 + / View title + / Command Palette
- 流程：QuickPick Type -> InputBox Name（可空=auto）-> 校验 -> CLI new --json -> auto connect
- 必须防抖：创建过程中禁用重复提交（UI 层）

### 4.2 Rename
- InputBox -> 校验 -> CLI rename --json -> refresh Tree
- 若存在 terminals：
  - 若 API 支持 rename 则同步
  - 否则：提示“一键重开并聚焦新终端”（自动开新 terminal attach）

### 4.3 Kill / Detach All Clients
- Kill：CLI kill --json；成功后 refresh；并提示是否关闭相关 terminals
- Detach All：
  - 若 CLI 支持 detach-all：调用并 refresh
  - 否则：关闭所有匹配该 shortName 的 terminals（VS Code 层），并提示用户 tmux detach

## 5) Auto Discovery + Handshake（环境一致性）
- 扩展启动或首次运行命令时：
  - 若 tmuxAi.cliPath 未设置：
    - 按 tmuxAi.discovery.searchPaths 逐个探测可执行文件
    - 发现后提示使用并写入 settings
  - 探测失败弹窗引导（Open File / Settings）
- Handshake：
  - 每次关键操作前（至少 activate 后第一次 list）检查 protocolVersion
  - 不兼容必须友好提示并停止执行危险操作（避免误解析文本输出）

## 6) Configuration Schema（必须全部定义，避免自由发挥）
在 package.json contributes.configuration 中明确 key：
- tmuxAi.cliPath: string | null
- tmuxAi.discovery.searchPaths: string[]
- tmuxAi.namingPattern: string (default "{type}-{n}")
- tmuxAi.passiveSync.enabled: boolean (default true)
- tmuxAi.terminal.nameFormat: string (default "AI: {shortName}")
- tmuxAi.terminal.multiClientNameFormat: string (default "AI: {shortName} ({k})")
- tmuxAi.terminal.useProfileFallback: boolean (default false)
- tmuxAi.debug: boolean (default false)

# Implementation Plan（PR 级分步提交，每步可运行）
Step 1: CLI Modernization（JSON + Atomic + Versioning + Validation）
- 实现 protocolVersion
- 实现 list/new/attach/rename/kill（可选 detach-all）
- 实现 atomic new（锁+自旋+超时 或 创建失败重试）
- 实现 name 校验 `[a-zA-Z0-9_-]+`
- docs/cli-contract.md + concurrency smoke test

Step 2: Extension Scaffold & Config & Auto Discovery
- 初始化 TS 扩展
- 实现 config keys + discovery UI
- 最小 Refresh 命令跑通

Step 3: CliRunner（Robust Exec）
- execFile 包装、timeout、JSON parse、错误边界
- handshake 检查 protocolVersion

Step 4: TreeDataProvider（Grouping + Instance Colors + Inline Actions + Passive Sync）
- 分组展示
- description 显示 (N clients)
- inline actions
- window focus passive sync + debounce

Step 5: TerminalManager（Rehydration + Cross Validation + Zombie Handling + Smart Focus）
- activate rehydrate
- zombie 节点与 close action
- Smart Focus + New Client + mapping cleanup

Step 6: Interactive Features（New/Rename/Kill/Detach All）
- New Session flow（防抖）
- Rename flow（同步 terminals）
- Kill/Detach All

Step 7: Packaging & Publish
- vsce package -> .vsix
- README：前置依赖、配置、被动同步、版本握手、常见问题、debug

# Deliverables（必须输出）
1) PR 拆解计划（每步列出改动文件）
2) 最终目录结构树
3) 关键源码：
   - 修改后的 bin/ai（JSON + protocolVersion + atomic new + validation 重点）
   - docs/cli-contract.md（schema + examples）
   - src/cli/runner.ts（handshake + exec）
   - src/tree/provider.ts（grouping + inline actions + passive sync）
   - src/terminal/manager.ts（rehydration + cross validation + zombie）
   - package.json（contributes：views/commands/menus/configuration）
4) 构建/打包/发布指令（vsce package/publish）

# Start Now
现在，请从 Step 1（CLI Modernization）开始执行，并在输出一开始先给出：
- 现有命名规则与 session 映射总结（从 repo 读出来的）
- 你设计的 protocolVersion=1 的 JSON schema（最小字段）
- atomic new 的实现方案（锁/自旋/超时 或 创建失败重试）与关键代码


