# tmux-ai-cli

[English](#english) | [中文](#中文)

---

## 中文

> 管理多个 AI 工具（Claude、Gemini、Codex）的 tmux 会话管理器

[![Version](https://img.shields.io/badge/version-0.0.18-blue)](https://github.com/liq22/tmux-ai-cli)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

### 特性

- **独立会话架构** - 每个 AI 实例是独立的 tmux session，支持多终端同时显示不同 AI
- **智能自动编号** - 自动创建 claude-1, claude-2, gemini-1 等编号实例
- **自定义名称** - `ai new <type> <name>` / `ai rename` 支持 ai-work 等更易记的名字
- **快捷键切换** - `c1`、`g1`、`x1` 快速进入对应实例
- **统一视图模式** - master 模式可在单终端内切换所有 AI
- **VS Code 集成** - 提供 VS Code 扩展，支持图形化管理会话

### tmux 兼容性

| tmux 版本 | 支持状态 |
|-----------|----------|
| >= 3.1 | ✅ 完全支持 |
| 3.0a | ✅ 支持（已兼容） |
| < 3.0 | ⚠️ 可能存在兼容性问题 |

**注意**: v0.0.18 已修复 tmux 3.0a 的 `list-sessions -t` 不兼容问题。

### 安装

#### 自动安装（推荐）

```bash
curl -sSL https://raw.githubusercontent.com/liq22/tmux-ai-cli/main/install.sh | bash
```

#### 手动安装

```bash
# 克隆仓库
git clone https://github.com/liq22/tmux-ai-cli.git ~/tmux-ai-cli
cd ~/tmux-ai-cli

# 运行安装脚本
./install.sh
```

### 使用

```bash
# 查看所有实例（带编号）
ai list

# JSON 输出（供 VS Code 扩展使用）
ai list --json

# 智能选择（交互式菜单）
ai

# 快速切换
ai claude-1        # 完整名称
ai c1              # 快捷键 (c=claude, g=gemini, x=codex)
ai 1               # 编号切换（第1个实例）

# 创建新实例
ai new claude
ai new gemini
ai new codex
ai new claude work # 创建自定义名称 ai-work

# 重命名实例
ai rename claude-1 work
ai mv c1 c3        # claude-1 → claude-3

# 统一视图模式
ai master
```

### VS Code 扩展

安装 `packages/vscode-tmux-ai/` 中的 `.vsix` 文件，获得图形化会话管理体验：

- 会话树视图（按类型分组）
- 一键连接/新建客户端/重命名/删除
- 被动同步（获得焦点时自动刷新）
- 孤立终端清理

详见 [packages/vscode-tmux-ai/README.md](packages/vscode-tmux-ai/README.md)

### 更新日志 (v0.0.18)

- **修复**: tmux 3.0a 兼容性问题（`list-sessions -t` 不支持）
- **修复**: VS Code 扩展强制 `env -u TMUX` 避免嵌套 tmux 错误
- **改进**: attach 使用 `sendText()` 方式，错误信息更清晰
- **新增**: 后端自动检测功能（Sessions 为空但存在孤立终端时）

---

## English

> A tmux session manager for multiple AI tools (Claude, Gemini, Codex)

[![Version](https://img.shields.io/badge/version-0.0.18-blue)](https://github.com/liq22/tmux-ai-cli)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

### Features

- **Independent Session Architecture** - Each AI instance runs in its own tmux session
- **Smart Auto-Numbering** - Automatically creates claude-1, claude-2, gemini-1, etc.
- **Custom Names** - Support for memorable names like `ai-work` via `ai new <type> <name>`
- **Quick Switching** - Use `c1`, `g1`, `x1` shortcuts to jump between instances
- **Unified View Mode** - Master mode allows switching between all AIs in a single terminal
- **VS Code Integration** - Includes a VS Code extension for graphical session management

### tmux Compatibility

| tmux Version | Support Status |
|--------------|----------------|
| >= 3.1 | ✅ Fully supported |
| 3.0a | ✅ Supported (compatibility fixed) |
| < 3.0 | ⚠️ May have compatibility issues |

**Note**: v0.0.18 fixed the `list-sessions -t` incompatibility with tmux 3.0a.

### Installation

#### Auto Install (Recommended)

```bash
curl -sSL https://raw.githubusercontent.com/liq22/tmux-ai-cli/main/install.sh | bash
```

#### Manual Install

```bash
git clone https://github.com/liq22/tmux-ai-cli.git ~/tmux-ai-cli
cd ~/tmux-ai-cli
./install.sh
```

### Usage

```bash
# List all instances (with numbers)
ai list

# JSON output (for VS Code extension)
ai list --json

# Interactive selection menu
ai

# Quick switching
ai claude-1        # Full name
ai c1              # Shortcut (c=claude, g=gemini, x=codex)
ai 1               # By number (1st instance)

# Create new instance
ai new claude
ai new gemini
ai new codex
ai new claude work # Create custom name ai-work

# Rename instance
ai rename claude-1 work
ai mv c1 c3        # claude-1 → claude-3

# Unified view mode
ai master
```

### VS Code Extension

Install the `.vsix` file from `packages/vscode-tmux-ai/` for a graphical session management experience:

- Session tree view (grouped by type)
- One-click connect/new client/rename/kill
- Passive sync (auto-refresh on focus)
- Orphaned terminal cleanup

See [packages/vscode-tmux-ai/README.md](packages/vscode-tmux-ai/README.md) for details.

### Changelog (v0.0.18)

- **Fixed**: tmux 3.0a compatibility issue (`list-sessions -t` not supported)
- **Fixed**: VS Code extension forces `env -u TMUX` to avoid nested tmux errors
- **Improved**: attach uses `sendText()` method for clearer error messages
- **Added**: backend auto-detection (when Sessions is empty but orphaned terminals exist)

---

## License

MIT License - see [LICENSE](LICENSE)

## Contributing

Issues and Pull Requests are welcome!

## Related Projects

- [tmux](https://github.com/tmux/tmux) - Terminal multiplexer
- [Claude Code](https://claude.ai/code) - Anthropic's AI coding assistant
