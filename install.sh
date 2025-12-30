#!/usr/bin/env bash
set -euo pipefail

# tmux-ai-cli 安装脚本 v0.0.1

# 默认安装位置
PREFIX="${PREFIX:-$HOME/.local}"
CONFIG_DIR="${CONFIG_DIR:-$HOME/.config/tmux-ai}"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# 获取脚本所在目录
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 检查是否在源码目录中
if [ ! -f "$script_dir/bin/ai" ]; then
  error "未在源码目录中运行，请 cd 到 tmux-ai-cli 目录后运行 ./install.sh"
  exit 1
fi

info "tmux-ai-cli 安装程序 v0.0.1"
echo ""

# 确认安装信息
echo "安装配置:"
echo "  前缀目录: $PREFIX"
echo "  配置目录: $CONFIG_DIR"
echo ""

read -p "确认安装? (y/N): " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "取消安装"
  exit 0
fi

# 创建目录
info "创建目录..."
mkdir -p "$PREFIX/bin"
mkdir -p "$CONFIG_DIR"

# 复制脚本
info "安装脚本到 $PREFIX/bin/..."
cp "$script_dir/bin/ai" "$PREFIX/bin/"
cp "$script_dir/bin/ai-tmux" "$PREFIX/bin/"
chmod +x "$PREFIX/bin/ai" "$PREFIX/bin/ai-tmux"

# 复制配置
info "安装配置到 $CONFIG_DIR/..."
if [ -f "$CONFIG_DIR/.tmux.conf" ] || [ -f "$CONFIG_DIR/ai-types.yaml" ]; then
  warn "配置文件已存在，跳过复制（保留现有配置）"
else
  cp "$script_dir/config/.tmux.conf" "$CONFIG_DIR/"
  cp "$script_dir/config/ai-types.yaml" "$CONFIG_DIR/"
fi

# 检查 PATH
if ! echo "$PATH" | grep -q "$PREFIX/bin"; then
  warn ""
  warn "$PREFIX/bin 不在 PATH 中"
  warn ""
  warn "请将以下行添加到你的 ~/.bashrc 或 ~/.zshrc:"
  warn "  export PATH=\"$PREFIX/bin:\$PATH\""
  warn ""
  warn "然后运行: source ~/.bashrc  (或 source ~/.zshrc)"
fi

# 完成
echo ""
info "安装完成！"
echo ""
echo "快速开始:"
echo "  ai list              # 列出所有实例"
echo "  ai new claude        # 创建 claude 实例"
echo "  ai c1                # 快捷进入 claude-1"
echo "  ai help              # 查看帮助"
echo ""
echo "配置文件位置: $CONFIG_DIR"
