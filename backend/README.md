# Grok2API Backend

> 本项目只面向 Grok Build。网关核心源自 [chenyme/grok2api](https://github.com/chenyme/grok2api)（MIT），
> 注册与 Build Device OAuth 由本地工具完成，后端通过专用密钥保护的
> `POST /api/import/v1/accounts/build` 接收凭据并自动绑定代理。

Grok2API 的 Go 后端，负责 Build 账号导入、代理绑定、上游账号调度、协议转换、
额度管理、请求审计和管理 API，并可直接托管前端构建产物。

## 技术栈

- Go 1.26、Gin、GORM
- SQLite / PostgreSQL
- Memory / Redis
- Grok Build OAuth 为主要通道（代码中保留 Web / Console Provider，但管理端只暴露 Build）
- 不包含浏览器注册运行时；账号由外部工具注册、转换后导入

## 本地运行

配置文件位于仓库根目录。首次运行前创建本地配置并设置安全密钥：

```bash
cp config.example.yaml config.yaml
openssl rand -hex 32
openssl rand -base64 32
```

将生成值写入 `config.yaml` 的 `secrets`，然后启动：

```bash
cd backend
go run ./cmd/grok2api
```

首次启动后打开管理后台，会进入**管理员初始化页面**，在那里创建管理员账号即可。
`bootstrapAdmin` 仅在需要无人值守预置管理员时才使用；留空不会阻止服务启动。

服务默认监听 `http://127.0.0.1:28080`。也可以显式指定配置文件或监听地址：

```bash
go run ./cmd/grok2api --config /path/to/config.yaml --listen 0.0.0.0:28080
```

## 配置与存储

启动配置统一由根目录 `config.yaml` 管理，启动阶段字段见 [`config.example.yaml`](../config.example.yaml)。Provider、服务容量、批量任务、路由、媒体、审计和客户端密钥默认限制由管理端设置页持久化；除页面明确标记“重启生效”的字段外均会热加载。

PostgreSQL DSN 也可通过非空的 `GROK2API_DATABASE_URL` 注入；它的优先级高于 YAML，并会自动将数据库驱动切换为 `postgres`。空值不覆盖 YAML，程序不会隐式读取通用的 `DATABASE_URL`。

| 场景 | 数据库 | 运行态存储 |
| --- | --- | --- |
| 本地开发 / 单实例 | SQLite | Memory |
| 多实例部署 | PostgreSQL | Redis |

关系型数据库保存账号、凭据、模型、额度、客户端密钥、审计和媒体任务；Redis 仅承载限流、并发租约、粘滞路由、分布式锁和事件通知。敏感凭据使用 `credentialEncryptionKey` 加密，该密钥必须长期保留且不得提交到版本库。

运行设置与代理参数由管理端设置页维护；数据库驱动、监听地址、Redis、JWT 与加密密钥仍通过 YAML 配置并在启动时生效。

## 服务入口

- `/v1/*`：兼容 API
- `/api/admin/v1/*`：管理 API
- `/api/admin/v1/account-imports/key`：创建、轮换或撤销账号导入密钥
- `/api/import/v1/accounts/build`：使用导入密钥写入 Build OAuth 凭据并绑定 SOCKS/HTTP 代理
- `/healthz`、`/readyz`：健康与就绪探针
- `/swagger/index.html`：公开 API Swagger，仅在 `server.swaggerEnabled: true` 时注册
- `frontend.staticPath`：前端静态目录，默认 `./frontend/dist`

详细协议说明见 [`backend/docs`](./docs) 下的 Swagger 文档，或运行服务后访问 `/docs`。

修改公开接口注释后，在仓库根目录执行 `make swagger` 更新 `backend/docs/docs.go`、`swagger.json` 与 `swagger.yaml`。生产配置应保持 `server.swaggerEnabled: false`。

## 代码结构

```text
cmd/grok2api/       进程入口
internal/domain/    领域模型与规则
internal/application/ 应用服务与用例
internal/infra/     数据库、Provider、运行态与安全实现
internal/transport/ HTTP 路由、鉴权与协议适配
internal/repository/ 持久化接口
```

依赖方向保持为 Transport → Application → Domain，基础设施通过接口接入，不在领域层依赖 HTTP、数据库或具体 Provider。

Provider 通过声明式 Definition 和小型能力接口注册：Build 使用远程模型目录与 Billing。Gateway 只根据能力声明完成路由与调度，不在通用 Handler 中拼装 Provider 私有请求。本项目默认只对外提供 Build 通道。

## 验证

```bash
go test ./...
go test -race ./...
go vet ./...
go build ./cmd/grok2api
```
