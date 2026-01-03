# Changelog

All notable changes to tmux-ai-cli will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- 支持 `ai new <type> [name]` 创建自定义名称实例（如 `ai-work`）
- `ai delete <index>` 支持按编号删除

### Fixed

- `ai master` 统一视图模式创建/刷新窗口逻辑

## [0.0.1] - 2025-12-29

### Added

- **独立 session 架构** - 每个 AI 实例是独立的 tmux session
- **多 Tab 同时显示** - 支持多个终端 Tab 同时显示不同 AI
- **智能自动编号** - 自动创建 claude-1, claude-2, gemini-1 等编号实例
- **快捷键切换** - c1/g1/x1 快速进入对应实例
- **统一视图模式** - master 模式可在单终端内切换所有 AI
- **自动创建** - attach 到不存在的实例时自动创建
- **重命名功能** - 支持重命名现有实例
- **配置文件** - YAML 格式的 AI 类型定义
- **VS Code 集成** - 终端 profiles 和快捷键配置

### Commands

```bash
ai                    # 智能选择实例（菜单）
ai list               # 列出所有实例
ai new <type> [name]  # 创建新实例
ai <name>             # 附加到实例
ai c1 / g1 / x1       # 快捷键切换
ai rename <old> <new> # 重命名实例
ai master             # 统一视图
ai delete <name>      # 删除实例
ai cleanup            # 清理所有实例
```

### Configuration

- `~/.config/tmux-ai/.tmux.conf` - tmux 配置
- `~/.config/tmux-ai/ai-types.yaml` - AI 类型定义
- `TMUX_AI_CONFIG` 环境变量可自定义配置目录

### Supported AI Types

- `claude` - Claude Code
- `gemini` - Gemini
- `codex` - Codex

[0.0.1]: https://github.com/your-username/tmux-ai-cli/releases/tag/v0.0.1
