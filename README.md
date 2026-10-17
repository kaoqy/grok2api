# Grok2API（Build 版）

> 一个只面向 **Grok Build** 的账号管理与 API 网关：自动注册账号、自动开通 Build、
> 账号与代理绑定、定时养号，并把统一 API 暴露给下游客户端。

<p align="center">
  <a href="./backend/go.mod"><img alt="Go" src="https://img.shields.io/badge/Go-1.26-00ADD8?logo=go&logoColor=white" /></a>
  <a href="./frontend/package.json"><img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=111827" /></a>
  <a href="https://github.com/kaoqy/grok2api/pkgs/container/grok2api"><img alt="Docker" src="https://img.shields.io/badge/Docker-amd64%20%7C%20arm64-2496ED?logo=docker&logoColor=white" /></a>
</p>

语言：[简体中文](./README.md) | [English](./README.en.md)

---

## 这是什么

这是一个面向 **最新 Grok 模型**（Grok Build 通道，例如 `grok-4.7`）的账号池网关。
它把「注册账号 → 开通 Build → 绑定代理 → 对外提供 API」整条链路做成自动化流程，
并提供一个中文管理后台。

与其他同类方案不同，本项目**只保留 Build 账号模块**，因为最新模型只在 Build 通道提供。

## 功能特性

| 能力 | 说明 |
| --- | --- |
| 无头自动注册 | 容器内置 Playwright + 真实 Chromium，自动完成注册页交互、验证码与人机验证 |
| 自动开通 Build | 注册完成后，在同一浏览器会话内自动完成 Device 授权，直接产出 Build 账号 |
| 账号级代理绑定 | 注册前先选代理节点，开出来的账号后续请求固定走这个出口 |
| 定时注册 | 设置单日目标量，系统在一天内随机时间分次完成 |
| 代理池 | 支持 HTTP / HTTPS / SOCKS4 / SOCKS5 / SOCKS5H，可导入订阅并做健康检查 |
| 额度自动切换 | 免费额度、单模型额度、付费余额耗尽时自动摘号并轮换到下一个可用账号 |
| 请求审计 | 完整记录请求、账号、出口、耗时、Token 用量与失败原因 |
| 首次初始化 | 部署后首次访问直接进入管理员设置页，无需预填账号密码 |
| 统一 API | 暴露 OpenAI / Anthropic 兼容接口，支持流式输出 |

## 快速部署

镜像已发布到 GHCR，支持 `linux/amd64` 与 `linux/arm64`，**可匿名拉取**。

### 一键安装

```bash
curl -fsSL https://raw.githubusercontent.com/kaoqy/grok2api/main/scripts/install.sh | bash
```

脚本会自动完成：

1. 检查 Docker 环境
2. 生成 `config.yaml`（随机 `jwtSecret` 与 `credentialEncryptionKey`）
3. 创建数据目录并修正属主
4. 拉取镜像并启动容器
5. 等待服务就绪后输出访问地址

默认安装目录：`~/grok2api`

### 打开管理后台

```
http://127.0.0.1:28080
```

首次访问会直接进入**管理员初始化页面**，设置账号密码后即可登录。

### 指定版本

```bash
curl -fsSL https://raw.githubusercontent.com/kaoqy/grok2api/main/scripts/install.sh \
  | GROK2API_IMAGE=ghcr.io/kaoqy/grok2api:v1.0.0 bash
```

### 自定义参数

```bash
GROK2API_PORT=38080 \          # 宿主端口，默认 28080
GROK2API_DIR=/opt/grok2api \   # 安装目录
GROK2API_NAME=grok2api \       # 容器名
  bash install.sh
```

### 更新

```bash
curl -fsSL https://raw.githubusercontent.com/kaoqy/grok2api/main/scripts/update.sh | bash
```

拉取新镜像并重建容器，**配置与数据保持不变**。

### 卸载

```bash
# 只删除容器，保留数据
curl -fsSL https://raw.githubusercontent.com/kaoqy/grok2api/main/scripts/uninstall.sh | bash

# 连数据与配置一起删除
bash scripts/uninstall.sh --purge
```

## 手动部署

```bash
mkdir -p ~/grok2api/data
curl -fsSL https://raw.githubusercontent.com/kaoqy/grok2api/main/config.example.yaml \
  -o ~/grok2api/config.yaml

# 修改 config.yaml：至少填写 secrets 段
#   jwtSecret              >= 32 字符
#   credentialEncryptionKey  Base64 的 32 字节密钥（写入账号后不可更改）

sudo chown -R 10001:10001 ~/grok2api/data

docker run -d --name grok2api \
  --restart unless-stopped \
  -p 28080:28080 \
  -v ~/grok2api/config.yaml:/run/grok2api/config.yaml:ro \
  -v ~/grok2api/data:/app/data \
  -e TZ=Asia/Shanghai \
  ghcr.io/kaoqy/grok2api:v1.0.0
```

> `/app/data` 必须对容器内用户（uid `10001`）可写，否则 SQLite 无法创建。
> 入口脚本会尝试自动修正，宿主机权限受限时需要手动 `chown`。

## 使用流程

1. 打开管理后台，完成管理员初始化
2. 进入「设置 → 出口代理」，添加一个 `Grok Build` 作用域的代理节点并测试连通性
3. 进入「注册」页
   - 选择要使用的代理节点
   - 填写注册数量
   - 在「临时邮箱服务」区域填写服务地址、管理员密码、收信接口路径与收信域名，点保存即可，无需改配置文件
   - 需要自动养号时，开启「自动注册」并设置单日目标量
4. 点击开始注册。系统会自动注册账号并转为 Build 账号，绑定到所选代理
5. 在「账号」页可以看到新账号及其额度状态
6. 在「密钥」页创建客户端密钥，即可调用 API

## 配置说明

> 临时邮箱相关字段（`cloudflareBase` / `cloudflareKey` / `messagesPath` / `defaultDomains`）
> 推荐直接在「注册」页填写并保存，保存后立即生效、随数据卷持久化，并覆盖 `config.yaml` 中的同名配置。
> 以下 YAML 片段仅用于在首次启动前预置。

`config.yaml` 关键字段：

```yaml
server:
  listen: "0.0.0.0:28080"

secrets:
  jwtSecret: "<至少 32 字符随机串>"
  credentialEncryptionKey: "<Base64 的 32 字节密钥>"

database:
  driver: sqlite
  sqlite:
    path: "./data/backend.db"

registration:
  enabled: true            # 启用注册模块
  autoEnabled: false       # 是否开启定时自动注册
  dailyTarget: 10          # 单日注册目标量
  pythonPath: "/opt/registration-venv/bin/python"
  runnerPath: "/app/registration/runner.py"
  cloudflareBase: "https://你的临时邮箱服务地址"
  cloudflareKey: "你的管理员密码"
  messagesPath: "/api/mails"
  defaultDomains: "你的收信域名"
  headless: true
  chromiumPath: "/usr/bin/chromium"
  timeout: 30m
```

> `credentialEncryptionKey` 一旦写入账号就不能再改，否则历史凭据无法解密。
> 请注意备份。

## 调用 API

创建客户端密钥后，使用 OpenAI 兼容格式调用：

```bash
curl http://127.0.0.1:28080/v1/chat/completions \
  -H "Authorization: Bearer 你的客户端密钥" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "grok-4.7",
    "messages": [{"role": "user", "content": "你好"}],
    "stream": true
  }'
```

也支持 Anthropic 兼容接口与 Responses 接口，详见管理后台的「文档」页面。

## 技术栈

- 后端：Go 1.26、Gin、GORM、SQLite / PostgreSQL
- 前端：React 19、TypeScript、Vite、Tailwind CSS、shadcn/ui
- 自动化：Python 3、Playwright、Chromium
- 部署：Docker（多架构镜像）、GitHub Actions 自动构建

## 项目结构

```text
.
├── backend/            Go 后端（网关、账号池、审计、注册调度）
├── frontend/           中文管理后台
├── registration/       Playwright 无头注册执行器
├── scripts/            安装 / 更新 / 卸载脚本
├── docker/             容器入口脚本
└── tools/              可选 sidecar（出口质量守护）
```

## 常见问题

### 容器启动后立刻退出，提示数据库无法写入

数据目录属主不对。执行：

```bash
sudo chown -R 10001:10001 ~/grok2api/data
docker restart grok2api
```

### 注册失败：创建临时邮箱失败

在「注册」页填写的 `cloudflareBase` / `cloudflareKey` / `defaultDomains` 不正确，
或者临时邮箱服务不可访问。

### 注册卡在人机验证

人机验证由目标网站风控决定。更换更干净的出口代理通常能显著提高通过率。

### 端口被占用

换一个宿主端口：

```bash
GROK2API_PORT=38080 bash scripts/install.sh
```

### 忘记管理员密码

删除数据目录里的数据库后重新初始化（会同时清空账号池）：

```bash
docker rm -f grok2api
rm -f ~/grok2api/data/backend.db
bash scripts/install.sh
```

## 上游项目

本项目在三个开源项目的基础上整合而来，感谢原作者的工作：

| 上游项目 | 用途 |
| --- | --- |
| [chenyme/grok2api](https://github.com/chenyme/grok2api) | 网关核心：Provider 抽象、账号调度、额度管理、请求审计、管理 API 与前端框架 |
| [AaronL725/grok-register](https://github.com/AaronL725/grok-register) | 无头注册流程：Playwright 驱动、临时邮箱取码、Build 授权转换 |
| [ardeyouxipianyi/workbuddy2api-hub](https://github.com/ardeyouxipianyi/workbuddy2api-hub) | 管理端 UI：配色令牌、布局结构、卡片与表格视觉语言 |

三个项目均采用 MIT 许可。在此基础上，本项目重构为 **Build 单通道 + 自动注册 + 后台可配置** 的形态。

## License

[MIT](./LICENSE)
