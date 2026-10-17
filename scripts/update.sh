#!/usr/bin/env bash
# 一键更新脚本（Docker）：拉取新镜像并重建容器，保留数据与配置
set -euo pipefail

IMAGE="${GROK2API_IMAGE:-ghcr.io/kaoqy/grok2api:latest}"
DIR="${GROK2API_DIR:-$HOME/grok2api}"
PORT="${GROK2API_PORT:-28080}"
NAME="${GROK2API_NAME:-grok2api}"
CONTAINER_PORT=28080

log() { printf '\033[1;32m[grok2api]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[grok2api]\033[0m %s\n' "$*" >&2; }
die() { err "$*"; exit 1; }

command -v docker >/dev/null 2>&1 || die "未找到 docker。"
docker info >/dev/null 2>&1 || die "Docker 未运行或当前用户无权限。"

CONFIG="$DIR/config.yaml"
[ -f "$CONFIG" ] || die "未找到配置文件 $CONFIG，请先执行 install.sh。"

has_curl=0
if command -v curl >/dev/null 2>&1; then
  has_curl=1
fi

wait_ready() {
  local i
  for i in $(seq 1 90); do
    if [ "$has_curl" -eq 1 ]; then
      curl -fsS "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1 && return 0
    elif command -v wget >/dev/null 2>&1; then
      wget -qO- "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1 && return 0
    else
      docker ps --filter "name=^/${NAME}$" --filter status=running --format '{{.Names}}' | grep -q "^${NAME}$" && return 0
    fi
    sleep 1
  done
  return 1
}

if [ "$(id -u)" -eq 0 ]; then
  chown -R 10001:10001 "$DIR/data" 2>/dev/null || true
fi

log "拉取镜像: $IMAGE"
docker pull "$IMAGE" || die "镜像拉取失败。"

docker rm -f "$NAME" >/dev/null 2>&1 || true

log "重建容器 $NAME（宿主端口 $PORT）"
docker run -d --name "$NAME" \
  --restart unless-stopped \
  -p "${PORT}:${CONTAINER_PORT}" \
  -v "$CONFIG:/run/grok2api/config.yaml:ro" \
  -v "$DIR/data:/app/data" \
  -e TZ="${TZ:-Asia/Shanghai}" \
  "$IMAGE" >/dev/null || die "容器启动失败。"

if wait_ready; then
  log "更新完成，数据与配置保持不变。"
  log "访问 http://127.0.0.1:${PORT}"
else
  err "服务未在 90 秒内就绪。最近日志："
  docker logs --tail 40 "$NAME" >&2 || true
  exit 1
fi
