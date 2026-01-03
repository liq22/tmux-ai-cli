# CLI JSON Contract (`protocolVersion=1`)

本仓库的 VS Code 扩展将 **只通过 `--json`** 与 CLI 通信：不解析任何人类可读输出。

## 通用约定

- 所有 `--json` 输出：**stdout 仅 JSON**（单个 JSON object，一行）；任何 debug/warn 必须写入 **stderr**。
- 所有 JSON 响应都必须包含：
  - `ok: boolean`
  - `protocolVersion: 1`
- `ok=false` 时必须包含：
  - `code: string`
  - `message: string`
  - 可选 `hint: string`

## `ai list --json`

返回当前所有 types 与 sessions（供扩展 TreeView / Rehydration 使用）。

### Response（成功）

```json
{
  "ok": true,
  "protocolVersion": 1,
  "types": {
    "claude": { "label": "Claude", "icon": "sparkle", "base_color": "terminal.ansiMagenta", "desc": "Claude Code" }
  },
  "sessions": [
    {
      "name": "ai-claude-1",
      "shortName": "claude-1",
      "type": "claude",
      "tmuxSession": "ai-claude-1",
      "attachedClients": 2,
      "created": "2026-01-01T12:00:00Z",
      "lastUsed": "2026-01-01T12:10:00Z",
      "windowName": "claude-1"
    }
  ],
  "now": "2026-01-01T12:10:05Z"
}
```

### 字段说明

- `types`: 来自 `ai-types.yaml` 的 `types:`，字段映射：
  - `label`: 若 YAML 未提供 `label`，默认用 `typeId` 首字母大写
  - `desc`: 对应 YAML 的 `description`
- `sessions[].type`: 优先读取 tmux session option `@tmux_ai_type`；若不存在则尝试从 `shortName` 推导（兼容旧 session）。
- `sessions[].created/lastUsed`: ISO8601（UTC，`Z` 结尾）。

## `ai new --json --type <typeId> [--name <shortName>]`

创建新 session（不 attach），并返回新 session 信息。

- `shortName` 校验：仅允许 `[a-zA-Z0-9_-]+`
- `--name` 为空时：自动生成 `{type}-{n}`，并发下通过 tmux 原子创建失败重试保证唯一。

### Response（成功）

```json
{ "ok": true, "protocolVersion": 1, "session": { "...同 list.sessions[]..." } }
```

## `ai attach --json <shortName>`

不 attach，只返回用于 attach 的 argv（供扩展安全执行），并附带 session 信息。

### Response（成功）

```json
{
  "ok": true,
  "protocolVersion": 1,
  "argv": ["tmux", "-f", "/path/to/.tmux.conf", "-L", "ai", "attach", "-t", "ai-claude-1"],
  "session": { "...同 list.sessions[]..." }
}
```

## `ai rename --json <oldShortName> <newShortName>`

重命名 session，并返回新 session 信息（`session.shortName` 为新值）。

## `ai kill --json <shortName>`

删除 session（`tmux kill-session`）。

## `ai detach-all --json <shortName>`

断开该 session 的所有 clients（若 tmux 支持）。

## 错误码（最小集合）

- `E_INVALID_ARGS`: 参数缺失或未知参数
- `E_INVALID_SHORT_NAME`: shortName 不符合 `[a-zA-Z0-9_-]+` 或命中保留字（如 `master`）
- `E_TYPE_NOT_FOUND`: `--type` 不存在于 `ai-types.yaml`
- `E_NAME_TAKEN`: `--name` 对应 session 已存在 / rename 目标已存在
- `E_SESSION_NOT_FOUND`: 目标 session 不存在
- `E_TMUX_FAILED`: tmux 命令执行失败（详见 stderr）
- `E_CONFIG_NOT_FOUND`: 未找到 `ai-types.yaml`
- `E_TIMEOUT`: 原子创建重试超时

