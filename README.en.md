# Grok2API (Build Edition)

> A Build-only Grok account pool and API gateway. The runtime no longer embeds a
> browser registration stack. Build credentials are registered and converted
> locally, then imported through an authenticated API and pinned to a proxy.

Version: `v1.0.0`

Language: [简体中文](./README.md) | English

## Scope

This project is a derivative focused on:

- Grok Build OAuth account management;
- one fixed egress proxy per account;
- OpenAI-, Anthropic-, and Responses-compatible APIs;
- automatic account rotation after credential, quota, health, or egress failures.

The runtime image does not include Chromium, Playwright, DrissionPage, Xvfb, or a
temp-mail client. Local tooling performs signup and Build Device OAuth first; the
server receives the resulting credentials through the import API.

## Features

| Capability | Description |
| --- | --- |
| Build-only pool | Keeps Grok Build as the only account provider and targets current models such as `grok-4.7` |
| Build import API | Imports OAuth credentials and a proxy in one request |
| Automatic egress setup | Reuses a matching Build proxy node or creates one automatically |
| Per-account proxy | Every imported account is manually bound to its import proxy |
| Account rotation | Removes exhausted, invalid, cooling, or unhealthy accounts from scheduling |
| Model routes | Controls public model IDs, upstream targets, account bindings, and availability |
| Streaming | SSE streaming with first-token and generation-speed telemetry |
| Request audits | Account, model, egress, status, tokens, latency, and failure details |
| Browser playground | Test chat directly with a client key, including streaming and image generation |
| First-run setup | The first visit opens the administrator setup page |

## Quick deploy

Images are published to GHCR for `linux/amd64` and `linux/arm64`.

```bash
curl -fsSL https://raw.githubusercontent.com/kaoqy/grok2api/main/scripts/install.sh | bash
```

Default install directory: `~/grok2api`

Default URL: `http://127.0.0.1:28080`

The first visit opens administrator setup.

### Pin a release and choose a port

```bash
curl -fsSL https://raw.githubusercontent.com/kaoqy/grok2api/main/scripts/install.sh \
  | GROK2API_IMAGE=ghcr.io/kaoqy/grok2api:v1.0.0 \
    GROK2API_PORT=38080 \
    bash
```

### Update

```bash
curl -fsSL https://raw.githubusercontent.com/kaoqy/grok2api/main/scripts/update.sh | bash
```

Configuration and the `data/` volume are preserved.

### Uninstall

```bash
# Remove the container and keep data
curl -fsSL https://raw.githubusercontent.com/kaoqy/grok2api/main/scripts/uninstall.sh | bash

# Remove data and configuration too
bash scripts/uninstall.sh --purge
```

## Manual deployment

```bash
mkdir -p ~/grok2api/data
curl -fsSL https://raw.githubusercontent.com/kaoqy/grok2api/main/config.example.yaml \
  -o ~/grok2api/config.yaml

# Set jwtSecret and credentialEncryptionKey in config.yaml
sudo chown -R 10001:10001 ~/grok2api/data

docker run -d --name grok2api \
  --restart unless-stopped \
  -p 28080:28080 \
  -v ~/grok2api/config.yaml:/run/grok2api/config.yaml:ro \
  -v ~/grok2api/data:/app/data \
  -e TZ=Asia/Shanghai \
  ghcr.io/kaoqy/grok2api:v1.0.0
```

`credentialEncryptionKey` cannot be changed after credentials have been stored.

## Workflow

1. Complete administrator setup.
2. Add or confirm the target proxy under **Settings -> Egress proxies**.
3. Register the Grok account and complete Build Device OAuth with local tooling.
4. Submit the resulting credentials and proxy through the import API.
5. The service imports the account, creates or reuses the Build proxy node, and binds the account.
6. Verify the account, quota, and egress on the **Accounts** page.
7. Create a client key and call the inference API.

## Build import API

```http
POST /api/admin/v1/account-imports/build
Authorization: Bearer <admin-access-token>
Content-Type: application/json
```

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

At least one of `accessToken` and `refreshToken` is required; production imports
should provide the complete OAuth set.

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

The importer normalizes the proxy URL and computes its fingerprint. It reuses an
enabled Build node with the same fingerprint, otherwise it creates one. Each
imported account is bound to that node in `manual` mode.

## API call

```bash
curl http://127.0.0.1:28080/v1/chat/completions \
  -H "Authorization: Bearer <client-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "grok-4.7",
    "messages": [{"role": "user", "content": "hello"}],
    "stream": true
  }'
```

Anthropic Messages and OpenAI Responses compatibility endpoints are also available.

When upgrading from an older release, a legacy `registration` section in an
existing `config.yaml` is ignored safely. It neither blocks startup nor enables
any browser registration task.

## Image builds

[`ghcr-image.yml`](./.github/workflows/ghcr-image.yml) builds:

- `latest` on pushes to `main`;
- version tags on `v*.*.*`;
- `amd64` and `arm64` images, merged into one multi-architecture manifest.

## Layout

```text
.
├── backend/            Go gateway, account pool, proxy, audit, admin API
├── frontend/           React admin console
├── scripts/            install, update, uninstall
├── docker/             container entrypoint
├── tools/              optional egress quality guard
└── .github/workflows/  CI and multi-arch GHCR builds
```

## Upstream projects

| Project | Contribution |
| --- | --- |
| [chenyme/grok2api](https://github.com/chenyme/grok2api) | Gateway core, provider abstraction, account scheduling, quota, audit, and admin API |
| [AaronL725/grok-register](https://github.com/AaronL725/grok-register) | Early local registration, temp-mail verification, and Build authorization concepts |
| [ardeyouxipianyi/workbuddy2api-hub](https://github.com/ardeyouxipianyi/workbuddy2api-hub) | Admin console design language and interaction reference |

All three upstream projects use the MIT license. This repository is now a
Build-only API gateway without the embedded browser registration runtime.

## License

[MIT](./LICENSE)
