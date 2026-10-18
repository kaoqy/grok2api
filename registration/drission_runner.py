#!/usr/bin/env python3
"""Headed DrissionPage registration runner.

The previous Playwright implementation was detectable by the Turnstile widget
shown after email verification. DrissionPage drives the installed Chromium
through CDP without Playwright's browser automation fingerprint.
"""
from __future__ import annotations

import json
import os
import random
import re
import secrets
import string
import time
import calendar
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from DrissionPage import Chromium, ChromiumOptions

BUILD_CLIENT_ID = "b1a00492-073a-47ea-816f-4c329264a828"
BUILD_SCOPE = (
    "openid profile email offline_access grok-cli:access api:access "
    "conversations:read conversations:write"
)
DEVICE_CODE_URL = "https://auth.x.ai/oauth2/device/code"
DEVICE_TOKEN_URL = "https://auth.x.ai/oauth2/token"
SIGNUP_URL = "https://accounts.x.ai/sign-up?redirect=grok-com"

CODE_PATTERNS = (
    re.compile(r"\b([0-9]{3}-[0-9]{3})\b"),
    re.compile(r"\b([A-Z0-9]{3}-[A-Z0-9]{3})\b"),
    re.compile(r"(?<![0-9])([0-9]{6})(?![0-9])"),
    re.compile(r"\b([A-Z]{2,4}-[0-9]{3,4})\b"),
)
REJECTED_EMAIL_DOMAINS: set[str] = set()


class NonRetryableError(RuntimeError):
    pass


class EmailDomainRejected(RuntimeError):
    pass


def emit(event_type: str, message: str = "", **fields: Any) -> None:
    payload = {"type": event_type, "message": message}
    payload.update({key: value for key, value in fields.items() if value not in (None, "")})
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def config() -> dict[str, Any]:
    raw = os.environ.get("GROK_REGISTER_PAYLOAD", "")
    if not raw:
        raise SystemExit("缺少 GROK_REGISTER_PAYLOAD")
    return json.loads(raw)


def random_username(length: int = 10) -> str:
    alphabet = string.ascii_lowercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def random_password() -> str:
    return "N" + secrets.token_urlsafe(12) + "!a7#"


def random_profile() -> dict[str, str]:
    first = random.choice(["Alex", "Mason", "Louis", "Lucas", "Blake", "Oscar", "Leo", "Ethan"])
    last = random.choice(["Xu", "Cao", "Fan", "Lin", "Zhao", "Chen", "Wang"])
    return {"name": f"{first} {last}", "given": first, "family": last}


def parse_domains(raw: str) -> list[str]:
    values: list[str] = []
    seen: set[str] = set()
    for item in str(raw or "").replace("，", ",").split(","):
        domain = item.strip().lower()
        if domain and domain not in seen:
            seen.add(domain)
            values.append(domain)
    return values


def http_json(
    url: str,
    *,
    method: str = "GET",
    data: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    proxy: str = "",
    timeout: int = 30,
) -> dict[str, Any]:
    request_headers = {"Accept": "application/json", "User-Agent": "Mozilla/5.0"}
    request_headers.update(headers or {})
    body = None
    if data is not None:
        body = urllib.parse.urlencode(data).encode()
        request_headers["Content-Type"] = "application/x-www-form-urlencoded"
    request = urllib.request.Request(url, data=body, headers=request_headers, method=method)
    handlers = []
    if proxy:
        handlers.append(urllib.request.ProxyHandler({"http": proxy, "https": proxy}))
    else:
        handlers.append(urllib.request.ProxyHandler({}))
    opener = urllib.request.build_opener(*handlers)
    try:
        with opener.open(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:400]
        raise RuntimeError(f"HTTP {exc.code}: {detail}") from exc
    return json.loads(raw) if raw else {}


def create_mailbox(api_base: str, api_key: str, path: str, domain: str) -> tuple[str, str]:
    prefix = random_username()
    request = urllib.request.Request(
        api_base.rstrip("/") + path,
        data=json.dumps(
            {
                "name": prefix,
                "enablePrefix": True,
                **({"domain": domain} if domain else {}),
            }
        ).encode(),
        headers={
            "x-admin-auth": api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.loads(response.read().decode())
    address = str(payload.get("address") or "")
    token = str(payload.get("jwt") or "")
    if not address or not token:
        raise RuntimeError("临时邮箱响应缺少 address/jwt")
    return address, token


def extract_code(text: str) -> str:
    for pattern in CODE_PATTERNS:
        match = pattern.search(text)
        if match:
            return match.group(1)
    return ""


def mail_received_after(row: dict[str, Any], cutoff: float) -> bool:
    raw = str(row.get("created_at") or "").strip()
    if not raw:
        return True
    try:
        # cloudflare_temp_email's API returns created_at in UTC. time.mktime
        # would interpret it as local wall time and reject fresh messages.
        received = calendar.timegm(time.strptime(raw, "%Y-%m-%d %H:%M:%S"))
    except ValueError:
        return True
    return received >= cutoff


def fetch_code(api_base: str, path: str, token: str, timeout: int = 180, cutoff: float = 0) -> str:
    deadline = time.time() + timeout
    last_count = 0
    while time.time() < deadline:
        request = urllib.request.Request(
            api_base.rstrip("/") + path + "?limit=20&offset=0",
            headers={"Authorization": "Bearer " + token, "Accept": "application/json", "User-Agent": "Mozilla/5.0"},
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode())
        rows = payload.get("results") or []
        last_count = len(rows)
        for row in rows:
            if not mail_received_after(row, cutoff):
                continue
            raw = "\n".join(
                str(row.get(key) or "")
                for key in ("raw", "text", "content", "subject")
            )
            code = extract_code(raw)
            if code:
                emit("progress", f"已从邮件中提取验证码 {code}")
                return code
        emit("progress", f"等待验证码邮件，当前收件箱 {last_count} 封")
        time.sleep(3)
    raise RuntimeError(f"等待验证码邮件超时，收件箱 {last_count} 封")


def find(tab, selectors: list[str], timeout: float = 60):
    deadline = time.time() + timeout
    while time.time() < deadline:
        for selector in selectors:
            try:
                element = tab.ele(selector, timeout=0.4)
                if element:
                    return element
            except Exception:
                pass
        time.sleep(0.4)
    return None


def browser_options(proxy: str) -> ChromiumOptions:
    options = ChromiumOptions()
    options.auto_port()
    options.set_timeouts(base=1)
    options.headless(False)
    if proxy:
        options.set_proxy(proxy)
    for flag in (
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--lang=en-US",
        "--window-size=1365,900",
    ):
        options.set_argument(flag)
    return options


def dismiss_cookies(tab) -> None:
    for text in ("Reject All", "Accept All Cookies", "全部拒绝", "接受所有 Cookie"):
        try:
            button = tab.ele(f"text={text}", timeout=0.3)
            if button:
                button.click()
                time.sleep(0.3)
                return
        except Exception:
            pass


def click_turnstile(tab) -> None:
    rect = tab.run_js(
        """const frame = document.querySelector('iframe[src*="challenges.cloudflare.com"]')
            || document.querySelector('div.cf-turnstile, [data-sitekey]')
            || (document.querySelector('input[name="cf-turnstile-response"]') || {}).parentElement;
        if (!frame) return null;
        const r = frame.getBoundingClientRect();
        return {x: r.x, y: r.y, width: r.width, height: r.height};"""
    )
    x = float(rect["x"]) + 24 if rect else 493
    y = float(rect["y"]) + float(rect["height"]) / 2 if rect else 491
    tab.run_cdp("Input.dispatchMouseEvent", type="mousePressed", x=x, y=y, button="left", clickCount=1)
    tab.run_cdp("Input.dispatchMouseEvent", type="mouseReleased", x=x, y=y, button="left", clickCount=1)


def wait_turnstile(tab, timeout: int = 120) -> str:
    deadline = time.time() + timeout
    last_click = 0.0
    while time.time() < deadline:
        token = tab.run_js(
            """const input = document.querySelector('input[name="cf-turnstile-response"]');
            if (input && input.value) return input.value;
            if (window.turnstile && window.turnstile.getResponse) {
              try { return window.turnstile.getResponse() || ''; } catch (e) { return ''; }
            }
            return '';"""
        ) or ""
        if token:
            emit("progress", f"人机验证通过 token长度={len(token)}")
            return token
        if time.time() - last_click >= 8:
            click_turnstile(tab)
            emit("progress", "已点击 Cloudflare「Verify you are human」复选框")
            last_click = time.time()
        time.sleep(1)
    raise RuntimeError("Turnstile 验证超时")


def request_device_code(proxy: str) -> dict[str, Any]:
    payload = http_json(
        DEVICE_CODE_URL,
        method="POST",
        data={"client_id": BUILD_CLIENT_ID, "scope": BUILD_SCOPE},
        proxy=proxy,
    )
    if not payload.get("device_code") or not payload.get("user_code"):
        raise RuntimeError(f"Device Flow 启动失败: {payload}")
    return payload


def convert_to_build(tab, proxy: str, timeout: int = 180) -> dict[str, str]:
    device = request_device_code(proxy)
    user_code = str(device["user_code"])
    verify_url = str(
        device.get("verification_uri_complete")
        or f"https://accounts.x.ai/oauth2/device?user_code={user_code}"
    )
    tab.get(verify_url)
    time.sleep(3)
    continue_button = find(tab, ["xpath://button[normalize-space(.)='Continue']", "xpath://button[normalize-space(.)='继续']"], 20)
    if continue_button:
        continue_button.click()
        time.sleep(3)
    allow = find(
        tab,
        [
            "xpath://button[normalize-space(.)='Allow']",
            "xpath://button[normalize-space(.)='允许']",
            "xpath://button[normalize-space(.)='Authorize']",
            "css:button[value='allow']",
            "css:form button[type='submit']",
        ],
        60,
    )
    if not allow:
        raise RuntimeError("Build 授权页未找到 Allow 按钮")
    allow.click()
    deadline = time.time() + timeout
    interval = max(int(device.get("interval") or 5), 2)
    while time.time() < deadline:
        payload = http_json(
            DEVICE_TOKEN_URL,
            method="POST",
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                "device_code": device["device_code"],
                "client_id": BUILD_CLIENT_ID,
            },
            proxy=proxy,
        )
        if payload.get("access_token"):
            expires = int(payload.get("expires_in") or 21600)
            return {
                "access_token": str(payload["access_token"]),
                "refresh_token": str(payload.get("refresh_token") or ""),
                "id_token": str(payload.get("id_token") or ""),
                "expires_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + expires)),
            }
        if payload.get("error") not in ("authorization_pending", "slow_down"):
            raise RuntimeError(f"Device Flow 换取 token 失败: {payload}")
        time.sleep(interval)
    raise RuntimeError("Device Flow 等待 token 超时")


def run_one(cfg: dict[str, Any]) -> None:
    proxy = str(cfg.get("proxy") or "")
    browser = Chromium(browser_options(proxy))
    try:
        tab = browser.latest_tab
        tab.get(SIGNUP_URL)
        time.sleep(4)
        dismiss_cookies(tab)
        entry = find(
            tab,
            [
                "xpath://button[contains(normalize-space(.), 'Sign up with email')]",
                "xpath://button[contains(normalize-space(.), '使用邮箱注册')]",
            ],
            30,
        )
        if not entry:
            raise RuntimeError("未找到邮箱注册入口")
        entry.click()
        time.sleep(2)
        email_input = find(tab, ["css:input[type='email']", "css:input[name='email']"], 30)
        if not email_input:
            raise RuntimeError("未找到邮箱输入框")

        domains = [item for item in parse_domains(str(cfg.get("defaultDomains") or "")) if item not in REJECTED_EMAIL_DOMAINS]
        domains += [item for item in parse_domains(str(cfg.get("defaultDomains") or "")) if item in REJECTED_EMAIL_DOMAINS]
        if not domains:
            domains = [""]
        address = ""
        mailbox_token = ""
        mailbox_since = time.time() - 10
        for domain in domains:
            email_input = find(tab, ["css:input[type='email']", "css:input[name='email']"], 30)
            if not email_input:
                raise RuntimeError("未找到邮箱输入框")
            address, mailbox_token = create_mailbox(
                str(cfg.get("apiBase") or ""),
                str(cfg.get("apiKey") or ""),
                str(cfg.get("pathAccounts") or "/admin/new_address"),
                domain,
            )
            emit("progress", f"已创建邮箱 {address}", email=address)
            email_input.input(address)
            submit = find(tab, ["css:form button[type='submit']"], 10)
            if not submit:
                raise RuntimeError("邮箱提交按钮未出现")
            submit.click()
            code_input = find(tab, ["css:input[name='code']", "css:input[autocomplete='one-time-code']"], 60)
            if code_input:
                break
            body = tab.ele("tag:body").text.lower()
            if "invalid" in body and domain:
                REJECTED_EMAIL_DOMAINS.add(domain)
                emit("progress", f"域名 {domain} 被 xAI 拒绝")
                continue
            raise RuntimeError(f"提交邮箱后未进入验证码页: {tab.ele('tag:body').text[:300]}")
        else:
            raise RuntimeError("所有收信域名都被 xAI 拒绝")

        code = fetch_code(
            str(cfg.get("apiBase") or ""),
            str(cfg.get("pathMessages") or "/api/mails"),
            mailbox_token,
            cutoff=mailbox_since,
        )
        code_input.click()
        code_input.input(code.replace("-", ""))
        time.sleep(1)
        confirm = find(tab, ["xpath://form//button[@type='submit']", "text=Confirm email"], 10)
        if confirm:
            confirm.click()

        first = find(tab, ["css:input[autocomplete='given-name']", "css:input[name='givenName']"], 120)
        if not first:
            raise RuntimeError("资料页未出现")
        last = find(tab, ["css:input[autocomplete='family-name']", "css:input[name='familyName']"], 5)
        password = find(tab, ["css:input[type='password']"], 5)
        profile = random_profile()
        first.input(profile["given"])
        if last:
            last.input(profile["family"])
        if password:
            password.input(random_password())
        wait_turnstile(tab)
        submit_profile = find(
            tab,
            [
                "xpath://button[contains(normalize-space(.), 'Complete sign up')]",
                "xpath://button[contains(normalize-space(.), '完成注册')]",
            ],
            10,
        )
        if not submit_profile:
            raise RuntimeError("资料提交按钮未出现")
        submit_profile.click()
        emit("progress", f"已提交资料 {profile['name']}", email=address)

        sso = ""
        deadline = time.time() + 180
        while time.time() < deadline:
            cookies = tab.cookies(all_domains=True) or []
            values = {cookie.get("name"): cookie.get("value") for cookie in cookies if isinstance(cookie, dict)}
            sso = values.get("sso") or values.get("sso-rw") or ""
            if sso:
                break
            time.sleep(2)
        if not sso:
            raise RuntimeError("等待 SSO Cookie 超时")
        emit("account", "注册成功", email=address, sso=sso)

        build = convert_to_build(tab, proxy)
        emit(
            "build",
            "已转换为 Build 账号",
            email=address,
            access_token=build["access_token"],
            refresh_token=build["refresh_token"],
            id_token=build["id_token"],
            expires_at=build["expires_at"],
        )
    finally:
        browser.quit()


def main() -> int:
    cfg = config()
    count = max(1, int(cfg.get("count") or 1))
    attempts = max(1, int(cfg.get("attempts") or 2))
    for index in range(count):
        emit("progress", f"开始第 {index + 1}/{count} 个账号")
        last_error = ""
        for attempt in range(1, attempts + 1):
            try:
                run_one(cfg)
                last_error = ""
                break
            except NonRetryableError as exc:
                last_error = str(exc)
                emit("progress", f"第 {attempt}/{attempts} 次尝试失败: {last_error}")
                break
            except Exception as exc:
                last_error = str(exc)
                emit("progress", f"第 {attempt}/{attempts} 次尝试失败: {last_error}")
        if last_error:
            emit("error", last_error)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
