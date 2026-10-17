#!/usr/bin/env bash
# One-click uninstaller for grok2api (Docker).
set -euo pipefail

DIR="${GROK2API_DIR:-$HOME/grok2api}"
NAME="${GROK2API_NAME:-grok2api}"
PURGE="${1:-}"

log() { printf '\033[1;32m[grok2api]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[grok2api]\033[0m %s\n' "$*" >&2; }

command -v docker >/dev/null 2>&1 || { err "缺少依赖: docker"; exit 1; }

log "停止并删除容器 $NAME"
docker rm -f "$NAME" >/dev/null 2>&1 || true

if [ "$PURGE" = "--purge" ]; then
  if [ -z "$DIR" ] || [ "$DIR" = "/" ]; then
    err "拒绝删除不安全路径: $DIR"
    exit 1
  fi
  log "删除数据与配置目录: $DIR"
  rm -rf -- "$DIR"
  log "已完全卸载。"
else
  log "容器已删除，数据保留在: $DIR"
  log "如需同时删除数据和配置，请执行: $0 --purge"
fi
