# Fix Notes: VS Code 扩展 “0 sessions + Orphaned” 现象分析

> 截图：`packages/vscode-tmux-ai/fix/image.png`

修复执行计划：`packages/vscode-tmux-ai/fix/plan.md`

## 现状 / 复现

在 VS Code 的 **Tmux AI: Sessions** 视图中：
- Claude/Codex/Gemini 都显示 `0 session(s)`
- 同时出现 **Orphaned**（例如 `AI: test1/test2/hi Dead`）

在命令行侧出现明显分叉（示例）：
- `ai list` 只能看到少量实例（如 `ai-claude-1/2`, `ai-codex-1/2`）
- `ai-tmux list` 却能看到更多实例（如 `ai-test1/ai-test2/ai-hi/...`）

这两个现象说明：**VS Code 扩展 / 你的 shell / ai 命令 并没有连到同一个 tmux 后端**，所以彼此“看不到对方创建的 session”，并且 VS Code 里原有终端被标记为 Orphaned。

## 关键判断：tmux 后端不一致

tmux server 的“后端”由 socket 决定，而 socket 目录通常依赖：
- `TMUX_TMPDIR`（如果设置了）
- 否则默认 `/tmp/tmux-<uid>/...`（或 `os.tmpdir()`）

因此只要 VS Code Extension Host 和你的外部 shell 环境变量不同（尤其是 `TMUX_TMPDIR`），即使 `TMUX_AI_SOCKET=ai` 相同，也可能连接到 **不同的 tmux server**。

另外还有一个常见“隐形差异”：`ai` 的后端探测会把 `$PWD/.tmux-tmp` 当作候选目录之一。
如果你在命令行里习惯在项目根目录运行 `ai list`，但 VS Code Extension Host 运行 `ai` 时的工作目录（cwd）不是项目根目录，那么 `$PWD/.tmux-tmp` 指向的就不是同一个目录，结果也会连接到另一个 tmux server，表现为 **VS Code 里 0 sessions**。

典型表现：
- VS Code 里创建的 session 在外部 `ai list` 看不到（反之亦然）
- VS Code 视图显示 `0 sessions`，但 Orphaned 里还有之前开的终端（因为它们来自另一个 backend）

## 关键判断 2：嵌套 tmux（`env.TMUX`）导致 attach 直接失败

如果 VS Code（或 VS Code Server）本身是在一个 tmux 里启动的，那么 Extension Host 进程通常会带着 `TMUX` 环境变量。

此时扩展创建的终端进程会尝试运行类似命令：
- `tmux -L ai attach -t ai-XX`

tmux 会判定这是“嵌套 tmux”，常见报错为：
- `sessions should be nested with care, unset $TMUX to force`

并且直接以 **exit code 1** 退出，最终表现为：
- VS Code Tree 里 session 可能一直显示 `0 session(s)`（list/attach 都失败或被吞错）
- 新开的终端立刻变成 `Dead`，并出现在 **Orphaned**

## 新增现象：Connect 时终端进程直接退出（exit code: 1）

你反馈的错误（示例）：
- `env 'TMUX_TMPDIR=/tmp', 'tmux', '-f', '/home/user/.config/tmux-ai/.tmux.conf', '-L', 'ai', 'attach', '-t', 'ai-claude-1'` → exit code `1`

这条 VS Code 弹窗**通常不会包含 tmux 的 stderr**，因此 exit code `1` 本身无法直接判断原因；需要把同一条命令在终端里跑一次看输出：

```bash
env -u TMUX TMUX_TMPDIR=/tmp tmux -f ~/.config/tmux-ai/.tmux.conf -L ai attach -t ai-claude-1
```

常见根因（按概率排序）：

1) **backend 不一致（最常见）**：`TMUX_TMPDIR=/tmp` 不是创建该 session 时使用的 tmpdir；此时通常会看到：
   - `no server running on /tmp/tmux-<uid>/ai`（连不上 server）
   - 或 `can't find session: ai-claude-1`（连上了，但该 backend 下没有这个 session）

   处理方式：
   - 清空 `tmuxAi.cli.tmuxTmpDir`（让 CLI/扩展自动探测）或运行 `Tmux AI: Detect CLI Socket` 选择 `sessions>0` 的候选。

2) **仍在嵌套 tmux 场景**：如果启动 VS Code/Remote 时 `TMUX` 被注入（或 VS Code 的 terminal env 清除失败），tmux 会报：
   - `sessions should be nested with care, unset $TMUX to force`

   处理方式：
   - 确认 attach argv 包含 `env -u TMUX ...`，并升级到最新扩展/CLI（它会强制 `-u TMUX`）。

3) **权限/沙箱限制**：某些受限环境（容器/沙箱/Snap 等）可能无法连接 `/tmp/tmux-<uid>/ai`，会看到：
   - `Operation not permitted` / `permission denied`

   处理方式：
   - 先确认 **VS Code 运行用户与 tmux server 用户一致**：在 VS Code 集成终端执行 `id -u`，并检查 `ls -la /tmp/tmux-$(id -u)` 的 owner/权限
   - 如果你用的是 Snap/Flatpak 等沙箱版 VS Code：`/tmp` 往往是“私有命名空间”，导致看得到文件但无法连接/或根本不是同一个 `/tmp`；此时优先把 socket 放到 `$XDG_RUNTIME_DIR` 或 `$HOME/.tmux-tmp`（并在扩展里用 `tmuxAi.cli.tmuxTmpDir` 对齐）
   - 尝试把 tmux socket 放到 `XDG_RUNTIME_DIR`（如 `/run/user/<uid>`）或一个明确可访问的目录，并用 `tmuxAi.cli.tmuxTmpDir` 对齐。

把上面命令的 stderr 贴出来后，才能对号入座进一步精确修复。

## 本次修复的方向（代码层面）

### 1) 扩展：对齐 `TMUX_TMPDIR`

扩展新增并使用配置项：
- `tmuxAi.cli.tmuxTmpDir` → 注入到 CLI/终端的 `TMUX_TMPDIR`

并升级 `Tmux AI: Detect CLI Socket`：
- 不再只选 `TMUX_AI_SOCKET`
- 改为探测并选择 `(TMUX_TMPDIR, TMUX_AI_SOCKET)` 组合，确保连接到正确 tmux server

同时在 “0 sessions” 时会自动探测一次（`tmuxAi.cli.autoDetectBackend=true`）。

### 1.0) 扩展：固定 CLI 运行的 cwd（帮助 `$PWD/.tmux-tmp` 探测）

扩展现在会用“当前工作区的第一个根目录”作为运行 `ai` 的 cwd（没有 workspace folder 时回退到 `$HOME`）。
这能让 CLI 的 `$PWD/.tmux-tmp` 探测与你在项目目录运行 `ai` 的行为一致，从而减少 “VS Code 0 sessions，但 shell 有 sessions” 的概率。

### 1.1) 扩展：启动 tmux attach 时移除 `TMUX`

扩展在创建 attach 终端时会显式移除 `TMUX`（`TerminalOptions.env: { TMUX: null }`），避免嵌套 tmux 直接退出。

### 2) CLI：自动探测并输出可附着的 argv

`ai` 现在会自动探测可见 session 的 tmux backend（同时考虑 `TMUX_TMPDIR` 和 socket）并选择“包含当前 backend session 的超集”：
- 目标：让 `ai list` 与 `ai-tmux list` 不再分叉

另外：如果环境里 `TMUX_TMPDIR` 被 VS Code / SSH / systemd 注入，旧逻辑会把它当作固定值，导致探测不到其他目录（如 `/tmp`）下的 socket；现改为仅当 `TMUX_AI_BACKEND_FIXED=1` 时才把 `TMUX_TMPDIR` 视为固定覆盖。

同时 `ai attach --json` 返回的 `argv` 会在需要时包含：
- `env -u TMUX TMUX_TMPDIR=<...> tmux ...`

确保 VS Code 使用该 `argv` 启动的终端，附着到同一个 tmux server。

### 3) 扩展：bundled CLI 自动更新

扩展使用 bundled CLI（安装在 VS Code global storage）时：
- 若扩展升级导致 bundled CLI 过旧，会自动比对并静默更新（避免“扩展新逻辑，但 bundled 还是旧脚本”）

## 排查建议（给用户/测试）

1) 先对齐外部 CLI 到最新版（仓库根目录）：
- `./install.sh`（更新 `~/.local/bin/ai`，`ai-tmux` 为兼容 wrapper）

2) VS Code 安装最新 VSIX 后：
- 运行 `Tmux AI: Install tmux-ai-cli (Bundled)` 更新 bundled CLI
- 运行 `Tmux AI: Detect CLI Socket` 选择 sessions>0 的候选
- 运行 `Tmux AI: Diagnostics` 复制信息核对：
  - `tmuxAi.cli.socket / tmuxAi.cli.tmuxTmpDir / env.TMUX_TMPDIR`
  - 如果 `env.TMUX` 非空且你看到 attach exit code 1，基本可以确认是嵌套 tmux 问题（升级扩展/CLI 后应自动规避）。

3) 若历史上已经产生“多套 backend”，可能存在重复 session：
- 需要分别连接到各 backend 清理（kill/rename），最终保证全员统一到一个 `(TMUX_TMPDIR, socket)`。
