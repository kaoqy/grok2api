#!/usr/bin/env bash
# 一键安装脚本（Docker）
set -euo pipefail

IMAGE="${GROK2API_IMAGE:-ghcr.io/kaoqy/grok2api:latest}"
DIR="${GROK2API_DIR:-$HOME/grok2api}"
PORT="${GROK2API_PORT:-28080}"
NAME="${GROK2API_NAME:-grok2api}"
CONTAINER_PORT=28080

log() { printf '\033[1;32m[grok2api]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[grok2api]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[grok2api]\033[0m %s\n' "$*" >&2; }
die() { err "$*"; exit 1; }

command -v docker >/dev/null 2>&1 || die "未找到 docker，请先安装 Docker。"
docker info >/dev/null 2>&1 || die "Docker 未运行，或当前用户没有权限（可尝试 sudo，或把用户加入 docker 组）。"

case "$PORT" in
  ''|*[!0-9]*) die "GROK2API_PORT 必须是数字，当前为: $PORT" ;;
esac
if [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
  die "GROK2API_PORT 超出范围: $PORT"
fi

gen_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

gen_b64() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 32 | tr -d '\n'
  else
    head -c 32 /dev/urandom | base64 | tr -d '\n'
  fi
}

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
      # 没有可用的 HTTP 客户端时，退化为进程存活检查。
      docker ps --filter "name=^/${NAME}$" --filter status=running --format '{{.Names}}' | grep -q "^${NAME}$" && return 0
    fi
    sleep 1
  done
  return 1
}

log "安装目录: $DIR"
mkdir -p "$DIR/data"

CONFIG="$DIR/config.yaml"
if [ -f "$CONFIG" ]; then
  log "检测到已有配置，保留不变: $CONFIG"
else
  log "生成初始配置: $CONFIG"
  umask 077
  cat > "$CONFIG" <<YAML
server:
  listen: "0.0.0.0:${CONTAINER_PORT}"
  swaggerEnabled: false

auth:
  accessTokenTTL: 15m
  refreshTokenTTL: 720h
  secureCookies: false

secrets:
  jwtSecret: "$(gen_secret)"
  credentialEncryptionKey: "$(gen_b64)"

bootstrapAdmin:
  username: ""
  password: ""

frontend:
  staticPath: "./frontend/dist"

database:
  driver: sqlite
  sqlite:
    path: "./data/backend.db"

runtimeStore:
  driver: memory

deployment:
  replicas: 1
  clusterID: "grok2api"

media:
  driver: local
  local:
    path: "./data/media"

registration:
  enabled: false
  autoEnabled: false
  dailyTarget: 10
  pythonPath: "/opt/registration-venv/bin/python"
  runnerPath: "/app/registration/runner.py"
  workDir: "/app"
  cloudflareBase: ""
  cloudflareKey: ""
  messagesPath: "/api/mails"
  defaultDomains: ""
  headless: true
  chromiumPath: "/usr/bin/chromium"
  timeout: 30m
YAML
  chmod 600 "$CONFIG"
fi

# 已存在的 bind mount 目录归 root 所有时，容器内的非特权用户会写不进数据库。
# 先尝试交给容器的运行用户（uid 10001）。
if [ "$(id -u)" -eq 0 ]; then
  chown -R 10001:10001 "$DIR/data" 2>/dev/null || warn "无法调整 $DIR/data 属主"
else
  warn "当前非 root：如果容器无法写入数据库，请执行 sudo chown -R 10001:10001 \"$DIR/data\""
fi

log "拉取镜像: $IMAGE"
docker pull "$IMAGE" || die "镜像拉取失败。若是私有镜像，请先 docker login ghcr.io。"

docker rm -f "$NAME" >/dev/null 2>&1 || true

log "启动容器 $NAME（宿主端口 $PORT -> 容器端口 $CONTAINER_PORT）"
docker run -d --name "$NAME" \
  --restart unless-stopped \
  -p "${PORT}:${CONTAINER_PORT}" \
  -v "$CONFIG:/run/grok2api/config.yaml:ro" \
  -v "$DIR/data:/app/data" \
  -e TZ="${TZ:-Asia/Shanghai}" \
  "$IMAGE" >/dev/null || die "容器启动失败。"

if wait_ready; then
  log "安装完成。"
  log "请打开 http://127.0.0.1:${PORT} 完成管理员初始化。"
else
  err "服务未在 90 秒内就绪。最近日志："
  docker logs --tail 40 "$NAME" >&2 || true
  exit 1
fi
