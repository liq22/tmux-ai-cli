#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ai="$repo_root/bin/ai"

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux 未安装，无法运行并发 smoke" >&2
  exit 1
fi

tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

config_dir="$tmp_dir/config"
mkdir -p "$config_dir"

cat >"$config_dir/.tmux.conf" <<'EOF'
set -g base-index 1
EOF

# 使用 bash+sleep 避免依赖 claude/gemini/codex 二进制存在。
cat >"$config_dir/ai-types.yaml" <<'EOF'
types:
  claude:
    cmd: "bash -lc 'sleep 3600'"
    icon: sparkle
    base_color: terminal.ansiMagenta
    description: "Claude Code"
EOF

export TMUX_AI_CONFIG="$config_dir"
export TMUX_AI_SOCKET="ai-smoke-$RANDOM-$RANDOM"

out_dir="$tmp_dir/out"
mkdir -p "$out_dir"

echo "TMUX_AI_SOCKET=$TMUX_AI_SOCKET"

pids=()
for i in $(seq 1 20); do
  (
    set +e
    "$ai" new --json --type claude >"$out_dir/$i.json" 2>"$out_dir/$i.err"
    echo $? >"$out_dir/$i.rc"
  ) &
  pids+=("$!")
done

for pid in "${pids[@]}"; do
  wait "$pid" || true
done

if command -v python3 >/dev/null 2>&1; then
  python3 - "$out_dir" <<'PY'
import glob
import json
import os
import sys

out_dir = sys.argv[1]
paths = sorted(glob.glob(os.path.join(out_dir, "*.json")), key=lambda p: int(os.path.basename(p).split(".")[0]))

short_names = []
for p in paths:
  rc_path = p[:-5] + ".rc"
  rc = int(open(rc_path, "r", encoding="utf-8").read().strip() or "1")
  if rc != 0:
    err_path = p[:-5] + ".err"
    err = open(err_path, "r", encoding="utf-8", errors="replace").read()
    raise SystemExit(f"command failed: {p} rc={rc}\n{err}")
  obj = json.load(open(p, "r", encoding="utf-8"))
  if obj.get("ok") is not True:
    raise SystemExit(f"ok != true: {p} -> {obj}")
  short_names.append(obj["session"]["shortName"])

dups = sorted({x for x in short_names if short_names.count(x) > 1})
if dups:
  raise SystemExit(f"duplicate shortName(s): {dups}")

print(f"OK: {len(short_names)} sessions, all unique")
print("\n".join(short_names))
PY
else
  # 无 python3：做最小检查（解析 shortName 字段并检测重复）
  shorts="$(
    sed -n 's/.*\"shortName\"[[:space:]]*:[[:space:]]*\"\\([^\"]\\+\\)\".*/\\1/p' "$out_dir"/*.json | sort
  )"
  if [ -z "$shorts" ]; then
    echo "未解析到任何 shortName（建议安装 python3 以便更严格校验）" >&2
    exit 1
  fi
  dups="$(printf '%s\n' "$shorts" | uniq -d || true)"
  if [ -n "$dups" ]; then
    echo "发现重复 shortName:" >&2
    echo "$dups" >&2
    exit 1
  fi
  echo "OK: 20 sessions, all unique"
fi

# 清理：逐个 kill（避免残留 session）
if command -v python3 >/dev/null 2>&1; then
  shorts="$(python3 - "$out_dir" <<'PY'
import glob, json, os, sys
out_dir = sys.argv[1]
paths = glob.glob(os.path.join(out_dir, "*.json"))
for p in sorted(paths):
  obj = json.load(open(p, "r", encoding="utf-8"))
  print(obj["session"]["shortName"])
PY
)"
else
  shorts="$(sed -n 's/.*\"shortName\"[[:space:]]*:[[:space:]]*\"\\([^\"]\\+\\)\".*/\\1/p' "$out_dir"/*.json || true)"
fi

while read -r s; do
  [ -z "$s" ] && continue
  "$ai" kill --json "$s" >/dev/null 2>&1 || true
done <<<"$shorts"

echo "cleanup done"

