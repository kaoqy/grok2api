# Grok2API（Build Edition）

> 一个只面向 **Grok Build** 的账号池与 API 网关。运行时不再内置浏览器注册器；
> Build 账号由本地工具注册、授权、转换后，通过管理员导入 API 写入系统，并自动绑定指定 SOCKS/HTTP 代理。

当前版本：`v1.0.0`

语言：[简体中文](./README.md) | [English](./README.en.md)

## 项目定位

本项目是面向最新 Grok 模型的二次开发版本，重点解决四件事：

- 统一管理 Grok Build OAuth 凭据；
- 每个账号绑定固定出口代理，后续推理请求自动走对应代理；
- 对外提供 OpenAI、Anthropic 与 Responses 兼容 API；
- 在账号额度耗尽、凭据失效或出口异常时自动切换账号。

运行时镜像保持精简，不包含 Chromium、Playwright、DrissionPage、Xvfb 或临时邮箱模块。
账号注册和 Build Device OAuth 由本地维护工具完成，再通过导入 API 交付给服务端。

## 主要功能

| 能力 | 说明 |
| --- | --- |
| Build 单通道 | 只保留 Grok Build 账号池，面向 `grok-4.7` 等最新模型 |
| Build / Web 导入 API | 一次提交 OAuth 凭据或 SSO 与代理地址，自动创建账号并绑定出口 |
| 生图账号池 | 导入 Grok Web 账号即可使用 `grok-imagine-image` 等生图模型 |
| 图片本地缓存 | 生图结果落盘到 `data/media`，并以公开 URL 返回，不依赖上游临时链接 |
| 额度定时重置 | Build 免费额度按滚动 24 小时窗口恢复，到期自动复核并放回号池 |
| SOCKS 代理 | 支持 SOCKS5、SOCKS5H、HTTP、HTTPS 等出口，并支持健康检查 |
| 自动建节点 | 导入时按代理指纹复用已有 Build 节点，没有则自动创建 |
| 自动切换账号 | 额度耗尽、凭据失效、冷却或质量异常时从调度池摘除并轮换 |
| 模型路由 | 管理公开模型名、上游模型、账号绑定与可用范围 |
| 流式输出 | 支持 SSE 首字与持续输出，并记录首字延迟和生成速度 |
| 请求审计 | 记录账号、模型、出口、状态、Token、耗时和错误原因 |
| 网页游乐场 | 使用客户端密钥直接对话，支持流式输出、推理和图片生成 |
| 首次初始化 | 首次访问直接进入管理员创建页面 |

## 快速部署

镜像发布在 GHCR，支持 `linux/amd64` 和 `linux/arm64`。

### 一键安装

```bash
curl -fsSL https://raw.githubusercontent.com/kaoqy/grok2api/main/scripts/install.sh | bash
```

默认安装目录为 `~/grok2api`，默认端口为 `28080`。

安装后访问：

```text
http://127.0.0.1:28080
```

首次访问会进入管理员初始化页面。

### 指定版本和端口

```bash
curl -fsSL https://raw.githubusercontent.com/kaoqy/grok2api/main/scripts/install.sh \
  | GROK2API_IMAGE=ghcr.io/kaoqy/grok2api:v1.0.0 \
    GROK2API_PORT=38080 \
    bash
```

### 更新

```bash
curl -fsSL https://raw.githubusercontent.com/kaoqy/grok2api/main/scripts/update.sh | bash
```

更新会拉取新镜像并重建容器，保留 `config.yaml` 与 `data/`。

### 卸载

```bash
# 保留数据
curl -fsSL https://raw.githubusercontent.com/kaoqy/grok2api/main/scripts/uninstall.sh | bash

# 连数据和配置一起删除
bash scripts/uninstall.sh --purge
```

## 手动部署

```bash
mkdir -p ~/grok2api/data
curl -fsSL https://raw.githubusercontent.com/kaoqy/grok2api/main/config.example.yaml \
  -o ~/grok2api/config.yaml

# 修改 config.yaml 中的 jwtSecret 与 credentialEncryptionKey
sudo chown -R 10001:10001 ~/grok2api/data

docker run -d --name grok2api \
  --restart unless-stopped \
  -p 28080:28080 \
  -v ~/grok2api/config.yaml:/run/grok2api/config.yaml:ro \
  -v ~/grok2api/data:/app/data \
  -e TZ=Asia/Shanghai \
  ghcr.io/kaoqy/grok2api:v1.0.0
```

`credentialEncryptionKey` 写入账号后不可更改，请务必备份。

## 使用流程

1. 打开管理后台并完成管理员初始化。
2. 在「设置 → 出口代理」添加或确认目标代理。
3. 在本地完成 Grok 账号注册和 Build Device OAuth。
4. 打开「账号接入」页，创建专用导入密钥。
5. 调用外部导入 API，把 Build OAuth 凭据与代理一起提交。
6. 服务端导入账号，自动创建或复用 Build 代理节点，并完成账号绑定。
7. 在「账号」页确认账号状态、额度和出口。
8. 在「密钥」页创建客户端密钥，即可调用推理 API。

## Build 账号导入 API

```http
POST /api/import/v1/accounts/build
Authorization: Bearer <账号导入密钥>
Content-Type: application/json
```

账号导入密钥在管理后台「账号接入」页面创建或轮换。它只用于这个导入端点，
不能登录管理后台，也不能调用 `/v1/*` 推理接口。

请求示例：

```json
{
  "email": "user@example.com",
  "name": "Grok Build 01",
  "clientId": "b1a00492-073a-47ea-816f-4c329264a828",
  "accessToken": "<access token>",
  "refreshToken": "<refresh token>",
  "idToken": "<id token>",
  "expiresAt": "2026-10-18T15:06:40Z",
  "proxyName": "Singapore Oracle",
  "proxyUrl": "socks5://user:pass@129.150.51.127:4499"
}
```

`accessToken` 和 `refreshToken` 至少提供一个；生产环境建议完整提交。

成功响应包含账号、代理节点和复用状态：

```json
{
  "data": {
    "created": 1,
    "updated": 0,
    "skipped": 0,
    "failed": 0,
    "accountId": "123",
    "egressNodeId": "45",
    "egressNodeName": "Singapore Oracle",
    "proxyDisplay": "129.150.51.127:4499",
    "reusedEgressNode": true
  }
}
```

导入逻辑会按规范化后的代理地址计算指纹：

- 已有同指纹的启用 Build 节点时直接复用；
- 没有时创建新的 Build 节点；
- 每个导入账号使用 `manual` 模式绑定到该节点；
- 后续该账号的请求固定走对应代理。

## Web 账号导入 API（生图）

Grok Web 账号承担生图等 Web 侧能力，使用同一把账号导入密钥写入：

```http
POST /api/import/v1/accounts/web
Authorization: Bearer <账号导入密钥>
Content-Type: application/json
```

请求示例：

```json
{
  "email": "user@example.com",
  "name": "Grok Web 01",
  "ssoToken": "<sso token>",
  "tier": "auto",
  "proxyName": "Singapore Oracle",
  "proxyUrl": "socks5://user:pass@129.150.51.127:4499"
}
```

`proxyUrl` 必填。导入逻辑与 Build 一致：按代理指纹复用或创建 Grok Web 出口节点，
再用 `manual` 模式把账号绑定到该节点，之后生图请求固定走对应代理。

生图结果的二进制会写入本地媒体库，接口返回可直接访问的公开地址：

```json
{
  "data": [
    {
      "mime_type": "image/jpeg",
      "url": "https://your-domain/v1/media/images/img_xxxxxxxx"
    }
  ]
}
```

## 反向代理与流式输出

`/v1/chat/completions`、`/v1/responses` 等流式端点会返回
`X-Accel-Buffering: no` 与 `Cache-Control: no-cache, no-transform`。
nginx / openresty 识别该响应头后会对本次响应关闭代理缓冲，SSE 才会边生成边下发。

如果流式请求「一直没有输出」，请检查反向代理是否改写或丢弃了这两个响应头；
同时建议为流式路径设置足够长的 `proxy_read_timeout`（例如 600s）：

```nginx
location / {
    proxy_pass http://127.0.0.1:28080;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_read_timeout 600s;
}
```

## Build 账号额度与恢复

Build 免费账号的额度上限是 500,000 Token。上游按**滚动 24 小时窗口**计量，
耗尽时返回 `subscription:free-usage-exhausted`，并附带
`Usage resets over a rolling 24-hour window — tokens (actual/limit): .../500000`。

也就是说额度会随窗口推移自行恢复，因此本项目**不会**用完即删账号，而是：

- 耗尽后把账号移出调度池，并记录下一次复核时间；
- 后台任务每 15 分钟复核一次已到期的账号，按同一滚动窗口口径重新统计已用 Token；
- 已用 Token 回落到上限以下即自动恢复该账号并放回号池；
- 仍未恢复则继续保留耗尽状态，等待下一次复核。

付费账号的额度由上游账期决定，到期后同样会自动恢复。

## 调用 API

创建客户端密钥后，调用 OpenAI 兼容接口：

```bash
curl http://127.0.0.1:28080/v1/chat/completions \
  -H "Authorization: Bearer <客户端密钥>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "grok-4.7",
    "messages": [{"role": "user", "content": "你好"}],
    "stream": true
  }'
```

同时提供 Anthropic Messages 与 OpenAI Responses 兼容接口。

## 关键配置

```yaml
server:
  listen: "0.0.0.0:28080"

secrets:
  jwtSecret: "<至少 32 字符随机串>"
  credentialEncryptionKey: "<Base64 编码的 32 字节密钥>"

database:
  driver: sqlite
  sqlite:
    path: "./data/backend.db"

runtimeStore:
  driver: memory
```

完整字段见 [`config.example.yaml`](./config.example.yaml)。

从旧版本升级时，已有 `config.yaml` 中的 `registration` 段会被安全忽略，
不会阻止服务启动，也不再启用任何浏览器注册任务。

## 镜像构建

GitHub Actions 工作流位于 `.github/workflows/ghcr-image.yml`：

- 推送 `main`：构建 `latest`；
- 推送 `v*.*.*` 标签：构建对应版本；
- 每次发布同时构建 `amd64` 与 `arm64`，再合并 manifest。

## 项目结构

```text
.
├── backend/            Go 网关、账号池、代理、审计与管理 API
├── frontend/           React 管理后台
├── scripts/            安装、更新、卸载脚本
├── docker/             容器入口
├── tools/              可选出口质量守护 sidecar
└── .github/workflows/  CI 与 GHCR 多架构镜像构建
```

## 上游项目

本项目是在以下开源项目基础上重构的二次开发版本：

| 上游项目 | 使用内容 |
| --- | --- |
| [chenyme/grok2api](https://github.com/chenyme/grok2api) | 网关核心、Provider、账号调度、额度、审计与管理 API |
| [AaronL725/grok-register](https://github.com/AaronL725/grok-register) | 早期本地注册、临时邮箱取码与 Build 授权思路 |
| [ardeyouxipianyi/workbuddy2api-hub](https://github.com/ardeyouxipianyi/workbuddy2api-hub) | 管理端设计语言与交互参考 |

三个上游项目均采用 MIT 许可。本仓库已经重构为 Build-only API 网关，不再内置浏览器注册运行时。

## License

[MIT](./LICENSE)
