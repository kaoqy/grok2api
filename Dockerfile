ARG NODE_VERSION=22
ARG GO_VERSION=1.26
ARG ALPINE_VERSION=3.23

FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-alpine AS frontend-builder

WORKDIR /src/frontend
RUN corepack enable

COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN --mount=type=cache,id=grok2api-pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm fetch --frozen-lockfile

RUN --mount=type=cache,id=grok2api-pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --offline --frozen-lockfile

COPY frontend/index.html frontend/vite.config.ts frontend/tsconfig.json frontend/tsconfig.app.json frontend/tsconfig.node.json ./
COPY frontend/public ./public
COPY frontend/src ./src
RUN --mount=type=cache,id=grok2api-tsc,target=/src/frontend/.cache,sharing=locked \
    pnpm build


FROM --platform=$BUILDPLATFORM golang:${GO_VERSION}-alpine AS backend-builder

ARG TARGETOS
ARG TARGETARCH

WORKDIR /src/backend
RUN apk add --no-cache ca-certificates git

COPY backend/go.mod backend/go.sum ./
RUN --mount=type=cache,id=grok2api-go-mod,target=/go/pkg/mod,sharing=locked \
    go mod download

COPY backend/cmd ./cmd
COPY backend/internal ./internal
COPY backend/docs/docs.go ./docs/docs.go
RUN --mount=type=cache,id=grok2api-go-mod,target=/go/pkg/mod,sharing=locked \
    --mount=type=cache,id=grok2api-go-build,target=/root/.cache/go-build,sharing=locked \
    CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -buildvcs=false -trimpath -ldflags="-s -w" -o /out/grok2api ./cmd/grok2api


FROM debian:bookworm-slim

ENV TZ=Asia/Shanghai \
    GROK2API_CONFIG_SOURCE=/run/grok2api/config.yaml \
    HOME=/home/grok2api \
    XDG_CONFIG_HOME=/home/grok2api/.config \
    XDG_CACHE_HOME=/home/grok2api/.cache

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates gosu tzdata wget xvfb \
      python3 python3-venv python3-pip \
      chromium fonts-freefont-ttf \
      libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
      libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
      libpango-1.0-0 libcairo2 && \
    rm -rf /var/lib/apt/lists/* && \
    python3 -m venv /opt/registration-venv && \
    /opt/registration-venv/bin/pip install --no-cache-dir playwright && \
    groupadd -g 10001 grok2api && \
    useradd -u 10001 -g grok2api -d /home/grok2api -m -s /usr/sbin/nologin grok2api && \
    mkdir -p /app/data /run/grok2api /var/lib/grok2api-quality-guard \
      /home/grok2api/.config /home/grok2api/.cache && \
    chown -R grok2api:grok2api \
      /app/data \
      /run/grok2api \
      /var/lib/grok2api-quality-guard \
      /home/grok2api && \
    chmod 0700 /var/lib/grok2api-quality-guard

WORKDIR /app

COPY --from=backend-builder --chmod=0755 /out/grok2api /app/grok2api
COPY --from=frontend-builder /src/frontend/dist /app/frontend/dist
COPY registration /app/registration
COPY VERSION /app/VERSION
COPY --chmod=0755 docker/entrypoint.sh /usr/local/bin/grok2api-entrypoint

EXPOSE 28080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://127.0.0.1:28080/healthz >/dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/grok2api-entrypoint"]
CMD ["/app/grok2api", "--config", "/app/config.yaml", "--listen", "0.0.0.0:28080"]
