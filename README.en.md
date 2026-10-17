# Grok2API (Build Edition)

> An account manager and API gateway dedicated to **Grok Build**: automatic
> registration, automatic Build activation, per-account proxy binding, scheduled
> account farming, and a unified API for downstream clients.

<p align="center">
  <a href="./backend/go.mod"><img alt="Go" src="https://img.shields.io/badge/Go-1.26-00ADD8?logo=go&logoColor=white" /></a>
  <a href="./frontend/package.json"><img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=111827" /></a>
  <a href="https://github.com/kaoqy/grok2api/pkgs/container/grok2api"><img alt="Docker" src="https://img.shields.io/badge/Docker-amd64%20%7C%20arm64-2496ED?logo=docker&logoColor=white" /></a>
</p>

Language: [简体中文](./README.md) | English

---

## What this is

This is an account-pool gateway aimed at the **latest Grok models** (the Grok Build
channel, for example `grok-4.7`). It automates the whole loop of
register -> activate Build -> bind a proxy -> serve an API, and ships with a
Chinese admin console.

Unlike other similar projects, this one keeps **only the Build account module**,
because the newest models are served exclusively through Build.

## Features

| Capability | Description |
| --- | --- |
| Headless registration | Playwright with a real Chromium inside the container; drives the signup page, captcha and bot checks automatically |
| Automatic Build activation | Right after registration, the same browser session completes the Device authorization and produces a Build account |
| Per-account proxy binding | Choose a proxy node before registering; every later request from that account leaves through that exact egress |
| Scheduled registration | Set a daily target and the system spreads the work across randomized times of day |
| Proxy pool | HTTP / HTTPS / SOCKS4 / SOCKS5 / SOCKS5H, subscription import and health checks |
| Quota-aware rotation | When free quota, per-model quota or paid balance runs out, the account is retired and traffic rotates to the next healthy one |
| Request audit | Full records of request, account, egress, latency, token usage and failure reason |
| First-run setup | The first visit after deployment opens the administrator setup page; no pre-filled credentials required |
| Unified API | OpenAI- and Anthropic-compatible endpoints with streaming support |

## Quick deploy

Images are published to GHCR for `linux/amd64` and `linux/arm64` and can be pulled
anonymously.

### One-click install

```bash
curl -fsSL https://raw.githubusercontent.com/kaoqy/grok2api/main/scripts/install.sh | bash
```

The script takes care of:

1. Checking the Docker environment
2. Generating `config.yaml` (random `jwtSecret` and `credentialEncryptionKey`)
3. Creating the data directory and fixing its ownership
4. Pulling the image and starting the container
5. Waiting for readiness and printing the access URL

Default install directory: `~/grok2api`

### Open the admin console

```
http://127.0.0.1:28080
```

The first visit opens the **administrator setup** page. Create the account and
password, then sign in.

### Pin a release

```bash
curl -fsSL https://raw.githubusercontent.com/kaoqy/grok2api/main/scripts/install.sh \
  | GROK2API_IMAGE=ghcr.io/kaoqy/grok2api:v1.0.0 bash
```

### Custom parameters

```bash
GROK2API_PORT=38080 \          # host port, default 28080
GROK2API_DIR=/opt/grok2api \   # install directory
GROK2API_NAME=grok2api \       # container name
  bash install.sh
```

### Update

```bash
curl -fsSL https://raw.githubusercontent.com/kaoqy/grok2api/main/scripts/update.sh | bash
```

Pulls the new image and recreates the container. **Configuration and data are kept.**

### Uninstall

```bash
# Remove the container only, keep data
curl -fsSL https://raw.githubusercontent.com/kaoqy/grok2api/main/scripts/uninstall.sh | bash

# Remove data and configuration as well
bash scripts/uninstall.sh --purge
```

## Manual deploy

```bash
mkdir -p ~/grok2api/data
curl -fsSL https://raw.githubusercontent.com/kaoqy/grok2api/main/config.example.yaml \
  -o ~/grok2api/config.yaml

# Edit config.yaml: at minimum fill in the secrets section
#   jwtSecret                >= 32 characters
#   credentialEncryptionKey  Base64 of a 32-byte key (cannot be changed once accounts exist)

sudo chown -R 10001:10001 ~/grok2api/data

docker run -d --name grok2api \
  --restart unless-stopped \
  -p 28080:28080 \
  -v ~/grok2api/config.yaml:/run/grok2api/config.yaml:ro \
  -v ~/grok2api/data:/app/data \
  -e TZ=Asia/Shanghai \
  ghcr.io/kaoqy/grok2api:v1.0.0
```

> `/app/data` must be writable by the container user (uid `10001`), otherwise
> SQLite cannot create its database. The entrypoint tries to fix this, but on
> restricted hosts you may need to `chown` manually.

## Usage flow

1. Open the admin console and complete administrator setup
2. Go to **Settings -> Egress proxies**, add a node scoped to `Grok Build`, and test connectivity
3. Go to the **Registration** page
   - Select the proxy node to use
   - Enter how many accounts to create
   - For continuous farming, enable **auto registration** and set a daily target
4. Start registration. Accounts are created, converted to Build, and bound to the selected proxy
5. The **Accounts** page shows the new accounts and their quota state
6. Create a client key on the **Keys** page, then call the API

## Configuration

Key fields in `config.yaml`:

```yaml
server:
  listen: "0.0.0.0:28080"

secrets:
  jwtSecret: "<random string, at least 32 chars>"
  credentialEncryptionKey: "<Base64 of a 32-byte key>"

database:
  driver: sqlite
  sqlite:
    path: "./data/backend.db"

registration:
  enabled: true            # enable the registration module
  autoEnabled: false       # enable scheduled auto registration
  dailyTarget: 10          # accounts per day
  pythonPath: "/opt/registration-venv/bin/python"
  runnerPath: "/app/registration/runner.py"
  cloudflareBase: "https://your-temp-mail-host"
  cloudflareKey: "your-admin-password"
  messagesPath: "/api/mails"
  defaultDomains: "your-mail-domain"
  headless: true
  chromiumPath: "/usr/bin/chromium"
  timeout: 30m
```

> `credentialEncryptionKey` cannot be changed after accounts have been written,
> or their stored credentials can no longer be decrypted. Back it up.

## Calling the API

After creating a client key, call it with the OpenAI-compatible format:

```bash
curl http://127.0.0.1:28080/v1/chat/completions \
  -H "Authorization: Bearer your-client-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "grok-4.7",
    "messages": [{"role": "user", "content": "hello"}],
    "stream": true
  }'
```

Anthropic-compatible endpoints and the Responses API are also available; see the
**Docs** page in the admin console.

## Tech stack

- Backend: Go 1.26, Gin, GORM, SQLite / PostgreSQL
- Frontend: React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui
- Automation: Python 3, Playwright, Chromium
- Deployment: Docker (multi-arch images), GitHub Actions auto build

## Project layout

```text
.
├── backend/            Go backend (gateway, account pool, audit, registration scheduler)
├── frontend/           Chinese admin console
├── registration/       Playwright headless registration runner
├── scripts/            install / update / uninstall scripts
├── docker/             container entrypoint
└── tools/              optional sidecars (egress quality guard)
```

## FAQ

### The container exits immediately, complaining it cannot write the database

The data directory ownership is wrong. Run:

```bash
sudo chown -R 10001:10001 ~/grok2api/data
docker restart grok2api
```

### Registration fails: cannot create a temp mailbox

`registration.cloudflareBase` / `cloudflareKey` / `defaultDomains` are not set
correctly, or the temp-mail service is unreachable.

### Registration stalls on the bot check

The bot check is decided by the target site's risk engine. Switching to a cleaner
egress proxy usually improves the pass rate a lot.

### Port already in use

Use a different host port:

```bash
GROK2API_PORT=38080 bash scripts/install.sh
```

### Forgot the administrator password

Delete the database in the data directory and initialize again (this also clears
the account pool):

```bash
docker rm -f grok2api
rm -f ~/grok2api/data/backend.db
bash scripts/install.sh
```

## Acknowledgements

The gateway core, provider abstraction, account scheduling, audit layer and
frontend framework originate from the open-source project
[chenyme/grok2api](https://github.com/chenyme/grok2api), licensed under MIT.
On top of it, this project is rebuilt as a **Build-only channel with automatic
registration**.

## License

[MIT](./LICENSE)
