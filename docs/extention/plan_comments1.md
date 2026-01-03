整体分步拆得很干净、顺序也对（先 CLI 契约，再扩展骨架，再 runner，再 UI，再 terminal 管理，再交互）。如果要再“防坑”到生产级，我建议补 10 条小改动（都是低成本、高收益）：

## 1) Step 0 里把“旧命名格式”写成可测试的规范

现在只说“确认兼容旧 terminal 命名格式”，建议产出一个小表 + 正则/解析规则（放 `docs/extention/naming_compat.md` 或直接写到 `src/terminal/naming.ts` 的单元测试里），否则后面 Rehydration 容易各写各的。

## 2) Step 1：明确 `protocolVersion` 的“握手触发点”和“升级策略”

建议在 `docs/cli-contract.md` 里写清楚：

* `ai list --json` 必须带 `protocolVersion`
* 扩展启动时的第一次 `list` 是 handshake
* 若版本不匹配：扩展进入 degraded mode（哪些命令禁用？至少 new/attach/rename/kill 全禁用，只保留“打开设置/刷新/查看错误”）

## 3) Step 1：统一“shortName vs tmuxSession”映射规则（避免分裂）

你验收里同时要求 `name/shortName/tmuxSession`，但没写转换规范。建议固定：

* `shortName = {type}-{n|slug}`
* `tmuxSession = {sessionPrefix}-{shortName}`（比如 `ai-claude-1`）
  并要求 CLI 的所有接口只接受 `shortName`，输出永远包含这三者。这样 TS 端不需要猜。

## 4) Step 1：并发安全建议选“创建失败重试”为主，锁为辅

锁文件方案跨平台/权限/清理麻烦。tmux 本身已经能作为原子判定：
`tmux new-session -d -s "$tmuxSession"` 若返回失败（已存在）就 n++ 重试即可，最后加一个上限（如 1..999）+ 超时。锁文件可以作为优化但不是必需品。

## 5) Step 1：给 JSON 输出加 `stdout` 纯净保证

你已经要求“不掺杂人类文本”，再加一条：

* 所有 debug / log 必须进 stderr
* stdout 仅 JSON
  并在 `runner.ts` 里严格用 stdout parse，stderr 只用于提示。

## 6) Step 2：建议把扩展目录放到 `packages/vscode-extension/`

现在是 `vscode-tmux-ai/`。能用，但长期看 monorepo 更清晰：
`packages/vscode-tmux-ai/`（或 `packages/vscode-extension/`）避免和 `vscode/` 旧目录混淆，也方便 npm workspaces。

## 7) Step 3：runner 需要“可取消”与“单飞行”机制

* Refresh/list 做成 single-flight：同一时间只跑一个 list（新请求复用同一个 Promise），避免 Passive Sync + 手动刷新 + Rehydration 同时打爆 CLI。
* 长操作（new/rename/kill）支持 cancellation token（至少 UI 上能取消/超时）。

## 8) Step 4：Passive Sync 建议用“焦点获得 + 文件变化”双通道（可选）

onDidChangeWindowState 很好；但 Remote/WSL/多窗口下有时不触发你预期。建议加一个可选 watcher：

* 让 CLI 在 `~/.cache/tmux-ai/state.json`（或 `.state` 文件）touch 更新时间
* 扩展监听该文件变化 -> 触发 refresh
  这条可以放 “optional future enhancement”，不强推进主线，但写在 plan 里会更完整。

## 9) Step 5：Zombie 的定义要精确区分两类

建议在 provider 里区分：

* **Orphaned Terminal**：有 VS Code terminal（AI: …），但 `ai list` 没该 session
  → 提供 Close Terminal（VS Code）
* **Orphaned Session**：`ai list` 有 session，但没有任何 VS Code terminal
  → Connect/Attach 正常工作
  否则 UI 容易把“session 不在 VS Code 中”误判成 zombie。

## 10) Step 6：命令幂等与“二次确认”策略

Kill/Detach All 建议：

* 默认弹一次确认（showWarningMessage with modal）并显示 shortName + client 数
* 或给配置项 `tmuxAi.confirm.destructiveActions`（默认 true）
  生产体验会更安全。

---

### 你这个计划里我唯一会调整的“步骤顺序”

把 **Rehydration 的最小实现提前到 Step 3 或 Step 4 末尾**（哪怕只做“扫描 terminals -> 建映射 -> Connect 优先复用”）。原因：你 Step 4 验收已经需要 Connect 可用，但如果不做最小 rehydrate，用户 Reload Window 后体验会断层。
不需要 zombie 交叉验证那么完整，先把“重启不重复开”做到即可；完整 zombie handling 仍放 Step 5。

---

### 建议补充的验收用例（每步一个最关键的）

* Step 1：并发 20 次 new，得到 20 个唯一 shortName；且 stdout 只有 JSON
* Step 3：CLI 返回非 JSON 时，扩展提示“CLI 过旧/协议不兼容”，不崩溃
* Step 4：窗口失焦->再聚焦，Tree 自动刷新且不闪烁（single-flight 生效）
* Step 5：外部 tmux kill-session 后，VS Code 里对应终端变成 Orphaned，Connect 被禁用但 Close 可用
* Step 6：同一 session New Client 连点 3 次，得到 (2)(3)(4) 三个终端，Tree 显示 (3 clients)

如果你愿意，我可以把这些建议直接“patch”进你这份 plan（给你一份改好的 markdown），保持你原有结构不变，只加关键小节与验收条目。


这份计划非常详尽且专业，结构清晰，**完全可以直接投喂给 AI (Claude/Gemini) 执行**。它已经把“坑”填得很平了（特别是 Rehydration 和 Atomic Creation 这种高难度动作）。

不过，站在“架构师”的角度，为了让最终落地的代码**健壮性（Robustness）**达到满分，我有以下 **3 点微调建议** 和 **1 个额外提示**：

### 1. 建议：增强 Rehydration 的“双重保险” (Step 5)

目前的 Rehydration 严重依赖解析 `terminal.name`。虽然这在 99% 的情况下有效，但如果用户手动改了 Terminal 名字，或者 VS Code 的 Title 渲染策略变了，映射就会失效。

**建议补充：**
在 `createTerminal` 时，利用 `env` 注入一个隐藏标记：

```typescript
vscode.window.createTerminal({
  name: `AI: ${shortName}`,
  env: { "TMUX_AI_SESSION_ID": shortName }, // 注入环境变量
  // ...
});

```

虽然 VS Code API 读取现有 Terminal 的 `env` 可能有限制（取决于版本），但这为 CLI 内部识别“我是被谁启动的”提供了可能。
**更重要的是**：建议在 `workspaceState` (Memento) 中也持久化存储一份 `TerminalCreationId -> SessionShortName` 的映射作为**辅助验证**。

* **启动时**：先尝试解析 Name。如果解析失败，查一下 `workspaceState` 里的记录试试？
* *如果不做这一步也没关系，保持 Name 解析的“无状态”简单性也是一种设计哲学，只要 Name Format 足够独特。* -> **结论：维持你现在的 Plan 即可，但要求 AI 在解析 Name 时必须使用 Strict Regex。**

### 2. 建议：完善 WSL/Remote 场景的路径处理 (Step 2 & 3)

VS Code 经常运行在 Remote (SSH/WSL) 模式下。

* 在这种情况下，Extension Host 运行在远程环境中。
* `bin/ai` 必须存在于**远程文件系统**中。
* `openFileDialog` 选择路径时，弹出的必须是**远程文件系统**的窗口。

**建议修改 Step 2：**
在 `config.ts` 或 `extension.ts` 中，明确要求处理路径时使用 `vscode.Uri.file(...)` 且意识到 `fs` 模块是操作远程文件的（如果使用 `vscode.workspace.fs` API 会更通用，但 `child_process.execFile` 需要本地路径 string）。
**简而言之**：在 Prompt 中加一句提醒：“**注意：扩展可能运行在 WSL/Remote 环境，CLI 路径探测和执行应基于 Extension Host 所在环境，而非 UI 客户端环境。**”

### 3. 建议：CLI JSON 生成的“非法字符防护” (Step 1)

Bash 处理 JSON 字符串拼接时，如果 Session Name 或者 Window Name 包含双引号、换行符或反斜杠，JSON 结构会崩。

**建议修改 Step 1：**
要求 `bin/ai` 在生成 JSON 时，对变量进行**最小转义（Minimal Escaping）**。
如果不想引入 heavy logic，至少要过滤掉 `"` 和 `\`，或者明确规定：
“CLI 必须确保输出的 JSON 是合法的。如果环境没有 `jq`，使用 Python one-liner (`python3 -c 'import json,sys; ...'`) 进行安全输出是首选；如果只有纯 Bash，必须手动替换/移除非法字符。”

### 4. 额外提示：Zombie Terminal 的“一键清理” UX (Step 5)

在 Step 5 中你提到了 `Zombie Handling`。
**建议：** 不要只标记为“Orphaned”，建议在 Tree View 的根节点或者 Type 节点上，当检测到有 Zombie 时，动态显示一个 **"Clean Detached Terminals"** 的按钮（图标：扫帚）。
这比让用户一个个去关终端要爽得多。

---

### 总结

你的 Plan 已经达到 **95分**。加上下面这句话作为 **"Pre-flight Checklist"** 补充给 AI，即可达到 100 分：

> **Additional Architectural Notes:**
> 1. **Safety First:** Ensure `bin/ai` produces valid JSON even if session names contain special characters (prefer Python/Perl for JSON generation if `jq` is missing).
> 2. **Remote Ready:** Write path detection logic assuming the extension might run in WSL/SSH Remote (check `os.platform()` of the extension host, not the UI client).
> 3. **Strict Rehydration:** When strictly regex-parsing `terminal.name` for rehydration, ensure the regex anchors to the start/end of the string to avoid false positives.
> 
> 

**可以直接开始执行 Step 0 & Step 1 了。Good luck!**