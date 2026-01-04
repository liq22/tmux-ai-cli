# Fix Plan：VS Code 扩展无法识别现有 session + attach 退出码 1

## 背景/现象

目前在 VS Code 里出现两类问题：

1) **Connect/Attach 终端启动失败（exit code: 1）**  
   示例（来自 VS Code 提示）：
   - `env -u TMUX TMUX_TMPDIR=/tmp tmux -f /home/user/.config/tmux-ai/.tmux.conf -L ai attach -t ai-3`

2) **Sessions 视图识别不到现有 session**  
   Tree 里常见表现是 `0 session(s)`，同时出现 **Orphaned/Dead** 的终端条目。

> 这两类问题高度相关：如果扩展/CLI 连到的 tmux backend 不一致，或 tmux 本身无法连接/读取配置，`list` 会变成“空”，`attach` 会直接失败。

---

## 目标（验收标准）

- `Tmux AI: Refresh Sessions` 后，Tree 能稳定显示现有 session（数量与命令行一致）。
- `Connect` 能附着到目标 session，终端不再立即变成 `Dead`。
- 在 VS Code 运行于 tmux 内（`env.TMUX` 存在）的情况下仍可正常工作（通过 `env -u TMUX` 规避嵌套 tmux）。
- 当失败发生时，扩展能给出**可定位原因**的诊断信息（而不是静默显示 0）。

---

## 优先级最高的 3 个假设（按概率排序）

### H1：tmux backend 不一致（socket / TMUX_TMPDIR 不一致）

- 同一个 `-L ai`，如果 `TMUX_TMPDIR` 不同，会连到**不同的 tmux server**。
- 结果：扩展看到的 session 与外部 `ai list` 不一致；`attach -t ai-3` 可能在该 backend 下根本不存在，从而 exit 1。

### H2：tmux 配置文件 `.tmux.conf` 不可用（缺失/语法错误/权限问题）

- 扩展/CLI 使用 `tmux -f /home/user/.config/tmux-ai/.tmux.conf ...`。
- 如果该文件缺失、不可读或包含不兼容指令，tmux 会直接退出（exit 1）。

### H3：VS Code Extension Host 与外部 shell 不在同一运行环境/用户

- Remote/容器/权限隔离导致无法访问 tmux socket（例如 socket 属于另一个 uid 或目录不可访问）。
- 表现与 H1 类似，但本质是“连不上 server”。

---

## Step 0：先采集诊断信息（不改代码）

请在 **VS Code 命令面板**运行：
- `Tmux AI: Diagnostics`（粘贴全部内容）
  - 重点关注 `cliCwd`：它是扩展运行 `ai` 的工作目录，会影响 CLI 的 `$PWD/.tmux-tmp` 探测。

并在 **VS Code 的集成终端**里跑（粘贴输出；关键是 stderr）：

1) 环境确认（是否在 tmux 内、tmux 版本、是否存在 env 命令）：
```bash
which env && env --version 2>/dev/null | head -n 1 || true
which tmux && tmux -V
echo "TMUX=$TMUX"
echo "TMUX_TMPDIR=$TMUX_TMPDIR"
echo "XDG_RUNTIME_DIR=$XDG_RUNTIME_DIR"
```

2) 复现扩展同款 attach，并捕捉 stderr（这一步最关键）：
```bash
env -u TMUX TMUX_TMPDIR=/tmp tmux -f ~/.config/tmux-ai/.tmux.conf -L ai attach -t ai-3
```

3) 判断“tmux server 是否可连 + session 是否存在”（比 attach 更安全）：
```bash
env -u TMUX TMUX_TMPDIR=/tmp tmux -f ~/.config/tmux-ai/.tmux.conf -L ai list-sessions
env -u TMUX TMUX_TMPDIR=/tmp tmux -f ~/.config/tmux-ai/.tmux.conf -L ai has-session -t ai-3; echo $?
```

4) 查看可能的 socket 目录（用于判断 backend 是否分叉）：
```bash
ls -la /tmp/tmux-$(id -u) || true
ls -la /run/user/$(id -u) || true
```

> 如果第 (3) 步 `list-sessions` 本身就失败（报 “cannot connect / can't open file / unknown option …”），优先处理 H2/H3；否则优先处理 H1。

---

## Step 1：如果确认是 H1（backend 不一致）

### 1.1 用扩展自动对齐 backend

- 运行 `Tmux AI: Detect CLI Socket`  
  选择 **sessions 数量最大且与你外部一致** 的候选（它会写入 `tmuxAi.cli.socket` 与 `tmuxAi.cli.tmuxTmpDir`）。
- 再运行 `Tmux AI: Refresh Sessions`。

### 1.2 计划中的代码增强（让对齐更“傻瓜”）

- **CLI（`bin/ai`）在 `--json` 模式下不要吞掉 tmux 错误**：  
  `list-sessions`/`has-session` 失败时返回：
  - `ok:false, code:E_TMUX_CONNECT/E_TMUX_CONFIG, message, hint`
- 新增 `ai doctor --json`（或 `ai debug --json`）输出：
  - 最终采用的 `TMUX_TMPDIR`、`socket`、`tmux_conf`、推导出的 socket 路径
  - `tmux list-sessions` 的 stderr（截断）
  - 当前 `env.TMUX`（用于判断嵌套 tmux）
- 扩展 `Tmux AI: Diagnostics` 调用 `ai doctor --json` 并展示（便于用户一键复制反馈）。

---

## Step 2：如果确认是 H2（tmux.conf 问题）

### 2.1 先定位 tmux 的真实报错

tmux 的 stderr 往往会直接指出是哪一行配置错误或文件不可读。

### 2.2 计划中的代码增强

- CLI 在发现 `tmux_conf` 不存在时，**回退到仓库默认 config**（或 bundled config），并在 `--json` 中返回 hint。
- 扩展增加一个“修复/重装 config”的命令（可选）：
  - `Tmux AI: Repair CLI Config`：把 bundled 的 `.tmux.conf` 与 `ai-types.yaml` 写到 `~/.config/tmux-ai`（或扩展专用 configDir），并提示用户差异。

---

## Step 3：如果确认是 H3（环境/权限隔离）

### 3.1 需要确认 Extension Host 的运行位置

通过 `Tmux AI: Diagnostics` 里的信息（尤其是 `cliPath` 与 `env.*`）判断是否在 Remote/容器。

### 3.2 计划中的代码增强

- 扩展在 list/attach 失败时，不再仅显示 `0 sessions`，而是提示：
  - “无法连接 tmux server（socket 权限/目录不可访问）”
  - 建议用户在同一环境下运行 tmux（或把 VS Code 放到相同 user/host）。

---

## Step 4：回归验证清单

1) 外部 shell 与 VS Code 内部都执行：
   - `ai list --json`（应看到同一批 sessions）
2) VS Code Tree：
   - Claude/Codex/Gemini 能显示正确数量
3) Connect：
   - 对任意一个存在的 session，Connect 后终端不 `Dead`
4) 新建 session：
   - 扩展创建后，外部 `ai list` 也能看到

---

## 相关文件（实现时会改到）

- CLI：`bin/ai`
- 扩展 attach 终端：`packages/vscode-tmux-ai/src/commands/session.ts`
- 扩展诊断：`packages/vscode-tmux-ai/src/commands/diagnostics.ts`
- 扩展 backend 探测：`packages/vscode-tmux-ai/src/commands/detectSocket.ts`、`packages/vscode-tmux-ai/src/extension.ts`
- 说明文档：`packages/vscode-tmux-ai/fix/README.md`
