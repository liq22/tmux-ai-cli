# tmux-ai-cli

> 管理多个 AI 工具（Claude、Gemini、Codex）的 tmux 会话管理器

[![Version](https://img.shields.io/badge/version-0.0.1-blue)](https://github.com/liq22/tmux-ai-cli)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

## 特性

- **独立会话架构** - 每个 AI 实例是独立的 tmux session，支持多终端同时显示不同 AI
- **智能自动编号** - 自动创建 claude-1, claude-2, gemini-1 等编号实例
- **自定义名称** - `ai new <type> <name>` / `ai rename` 支持 ai-work 等更易记的名字
- **快捷键切换** - `c1`、`g1`、`x1` 快速进入对应实例
- **统一视图模式** - master 模式可在单终端内切换所有 AI
- **VS Code 集成** - 提供终端 profiles 和快捷键配置

## 安装

### 自动安装（推荐）

```bash
curl -sSL https://raw.githubusercontent.com/liq22/tmux-ai-cli/main/install.sh | bash
```

### 手动安装

```bash
# 克隆仓库
git clone https://github.com/liq22/tmux-ai-cli.git ~/tmux-ai-cli
cd ~/tmux-ai-cli

# 运行安装脚本
./install.sh
```

### 从源码安装

```bash
# 复制文件到目标位置
PREFIX="$HOME/.local"
mkdir -p "$PREFIX/bin" "$HOME/.config/tmux-ai"

cp bin/* "$PREFIX/bin/"
cp config/* "$HOME/.config/tmux-ai/"
chmod +x "$PREFIX/bin"/ai*

# 添加到 PATH（如果需要）
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc  # 或 ~/.zshrc
source ~/.bashrc
```

## 使用

### 基本命令

```bash
# 查看所有实例（带编号）
ai list

# 智能选择（交互式菜单）
ai

# 快速切换
ai claude-1        # 完整名称
ai c1              # 快捷键 (c=claude, g=gemini, x=codex)
ai 1               # 编号切换（第1个实例）
ai work            # 自定义名称（如 ai-work）

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

# 删除实例
ai delete claude-2
ai delete 2          # 按编号删除

# 清理所有实例
ai cleanup
```

> 说明：`ai` 是唯一推荐入口；`ai-tmux` 仅保留为兼容命令（内部转发到 `ai`）。

### 快捷键映射

| 快捷键 | 完整名称 |
|--------|----------|
| `c1`, `c2`, `c3` | `claude-1`, `claude-2`, `claude-3` |
| `g1`, `g2`, `g3` | `gemini-1`, `gemini-2`, `gemini-3` |
| `x1`, `x2`, `x3` | `codex-1`, `codex-2`, `codex-3` |

### tmux 快捷键

| 按键 | 功能 |
|------|------|
| `Ctrl+B` 然后 `d` | 断开会话（AI 继续运行） |
| `Ctrl+B` 然后 `w` | 显示窗口列表 |
| `Ctrl+B` 然后 `1/2/3...` | 切换到指定窗口（master 模式） |

## 配置

### 配置文件位置

默认配置目录：`~/.config/tmux-ai/`

可通过环境变量 `TMUX_AI_CONFIG` 自定义：

```bash
export TMUX_AI_CONFIG="$HOME/my-config"
```

### AI 类型定义

编辑 `~/.config/tmux-ai/ai-types.yaml` 添加新的 AI 类型：

```yaml
types:
  claude:
    cmd: claude
    icon: sparkle
    base_color: terminal.ansiMagenta
    description: "Claude Code"

  # 添加新类型
  gpt:
    cmd: gpt
    icon: robot
    base_color: terminal.ansiYellow
    description: "GPT"
```

## VS Code 集成

### 方式一：项目级配置

在需要使用 AI 的项目根目录执行：

```bash
mkdir -p .vscode
cp ~/.config/tmux-ai/vscode/settings.json .vscode/
cp ~/.config/tmux-ai/vscode/keybindings.json .vscode/
```

### 方式二：全局用户级配置

所有项目生效，复制到 VS Code 用户配置目录：

```bash
# Linux/macOS
cp ~/.config/tmux-ai/vscode/settings.json ~/.config/Code/User/
cp ~/.config/tmux-ai/vscode/keybindings.json ~/.config/Code/User/

# Windows
cp $env:APPDATA\tmux-ai\vscode\settings.json $env:APPDATA\Code\User\
cp $env:APPDATA\tmux-ai\vscode\keybindings.json $env:APPDATA\Code\User\
```

> 注意：keybindings.json 会覆盖现有的快捷键配置，建议手动合并。

## 故障排查

- 如果 `ai list` 只能看到 `ai-claude-1` 这类编号实例，但 `ai-tmux list` 能看到 `ai-hi / ai-test1` 等自定义实例：说明你本机安装的 `ai` 还是旧版本，请在仓库根目录重新运行 `./install.sh` 覆盖安装。

### 可用快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Alt+1` | claude-1 |
| `Ctrl+Alt+2` | claude-2 |
| `Ctrl+Alt+3` | gemini-1 |
| `Ctrl+Alt+4` | gemini-2 |
| `Ctrl+Alt+5` | codex-1 |
| `Ctrl+Alt+Shift+N` | 新建 claude 实例 |
| `Ctrl+Alt+Shift+M` | 新建 gemini 实例 |

## 使用场景

### 场景 1：多 Tab 并排对比不同 AI

```
┌─────────────────┬─────────────────┐
│  Tab 1: claude-1 │  Tab 2: gemini-1 │
│  [回答 A]        │  [回答 B]        │
│                 │                 │
└─────────────────┴─────────────────┘
```

### 场景 2：单终端快速切换

```
┌─────────────────────────────────┐
│  AI: master (all)               │
│                                 │
│  [claude-1] 按 Ctrl+B+1         │
│  [gemini-1] 按 Ctrl+B+2         │
│  [codex-1]  按 Ctrl+B+3         │
│                                 │
└─────────────────────────────────┘
```

## 故障排查

### 命令找不到

```bash
# 确认安装位置
which ai

# 确认 PATH
echo $PATH | grep -q "$HOME/.local/bin" || export PATH="$HOME/.local/bin:$PATH"
```

### 清理 tmux server

```bash
tmux -L ai kill-server
```

### 查看所有实例

```bash
ai list
# 或
tmux -L ai list-sessions
```

## 版本历史

参见 [CHANGELOG.md](docs/CHANGELOG.md)

## 许可证

MIT License - 详见 [LICENSE](LICENSE)

## 贡献

欢迎提交 Issue 和 Pull Request！

## 相关项目

- [tmux](https://github.com/tmux/tmux) - 终端复用器
- [Claude Code](https://claude.ai/code) - Anthropic 的 AI 编程助手
