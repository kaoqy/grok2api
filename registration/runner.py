#!/usr/bin/env python3
"""Headless registration runner used by the grok2api registration service.

The runner receives a JSON payload through GROK_REGISTER_PAYLOAD and emits one
JSON object per line on stdout. The Go service owns account import, web-to-
build conversion, and final egress assignment.
"""
from __future__ import annotations

import json
import os
import random
import re
import secrets
import string
import time
from typing import Any
from urllib.parse import unquote, urlsplit

from playwright.sync_api import Browser, BrowserContext, Page, sync_playwright

BUILD_CLIENT_ID = "b1a00492-073a-47ea-816f-4c329264a828"
BUILD_SCOPE = (
    "openid profile email offline_access grok-cli:access api:access "
    "conversations:read conversations:write"
)
DEVICE_CODE_URL = "https://auth.x.ai/oauth2/device/code"
DEVICE_VERIFY_URL = "https://auth.x.ai/oauth2/device/verify"
DEVICE_TOKEN_URL = "https://auth.x.ai/oauth2/token"

REJECTED_EMAIL_DOMAINS: set[str] = set()


def emit(event_type: str, message: str = "", **fields: Any) -> None:
    payload = {"type": event_type, "message": message}
    payload.update({key: value for key, value in fields.items() if value not in (None, "")})
    print(json.dumps(payload, ensure_ascii=False), flush=True)


class NonRetryableError(RuntimeError):
    """不需要立即重试的错误（例如上游验证码频率限制）。"""


class EmailDomainRejected(RuntimeError):
    """xAI 拒绝该收信域名；可以换下一个域名继续，不必重启浏览器。"""


def payload() -> dict[str, Any]:
    raw = os.environ.get("GROK_REGISTER_PAYLOAD", "")
    if not raw:
        emit("error", "缺少 GROK_REGISTER_PAYLOAD")
        raise SystemExit(2)
    return json.loads(raw)


def random_username(length: int = 10) -> str:
    alphabet = string.ascii_lowercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def random_password() -> str:
    return "N" + secrets.token_urlsafe(12) + "!a7#"


def random_profile() -> dict[str, str]:
    first = random.choice(["Alex", "Mason", "Louis", "Lucas", "Blake", "Oscar", "Leo", "Ethan"])
    last = random.choice(["Xu", "Cao", "Fan", "Lin", "Zhao", "Chen", "Wang"])
    return {"name": f"{first} {last}", "given": first, "family": last, "birthday": "1995-06-15"}


def parse_domains(raw_domains: str) -> list[str]:
    """Normalize the administrator-configured receiving-domain list."""
    values: list[str] = []
    seen: set[str] = set()
    for item in str(raw_domains or "").replace("，", ",").split(","):
        domain = item.strip().lower()
        if not domain or domain in seen:
            continue
        seen.add(domain)
        values.append(domain)
    return values


def order_domains(domains: list[str], rejected: set[str]) -> list[str]:
    """Prefer domains that have not already been rejected by xAI."""
    healthy = [domain for domain in domains if domain not in rejected]
    unhealthy = [domain for domain in domains if domain in rejected]
    return healthy + unhealthy


def playwright_proxy(raw: str) -> dict[str, str] | None:
    """Convert a proxy URI into Playwright's proxy descriptor.

    Playwright expects the server URL without credentials and takes the
    username/password as separate fields. SOCKS5 is supported directly;
    "socks5h" is normalised to "socks5" because Playwright resolves DNS
    remotely for SOCKS regardless of the h suffix.
    """
    value = str(raw or "").strip()
    if not value:
        return None
    parsed = urlsplit(value)
    if not parsed.scheme or not parsed.hostname:
        raise ValueError(f"代理地址格式无效: {value}")
    scheme = parsed.scheme.lower()
    if scheme == "socks5h":
        scheme = "socks5"
    if scheme not in {"http", "https", "socks4", "socks5"}:
        raise ValueError(f"Playwright 不支持该代理协议: {scheme}")
    port = parsed.port
    authority = parsed.hostname if port is None else f"{parsed.hostname}:{port}"
    descriptor: dict[str, str] = {"server": f"{scheme}://{authority}"}
    if parsed.username:
        descriptor["username"] = unquote(parsed.username)
    if parsed.password:
        descriptor["password"] = unquote(parsed.password)
    return descriptor


def create_mailbox(context: BrowserContext, api_base: str, api_key: str, path: str, domains: str) -> tuple[str, str]:
    address_prefix = random_username()
    domain = (domains or "").split(",")[0].strip()
    request = context.request
    response = request.post(
        api_base.rstrip("/") + path,
        headers={"x-admin-auth": api_key, "Content-Type": "application/json"},
        data={"name": address_prefix, "enablePrefix": True, **({"domain": domain} if domain else {})},
    )
    if response.status >= 400:
        body = ""
        try:
            body = response.text()[:200]
        except Exception:
            pass
        raise RuntimeError(f"创建临时邮箱失败: HTTP {response.status} {body}".strip())
    data = response.json()
    address = str(data.get("address") or "")
    token = str(data.get("jwt") or "")
    if not address or not token:
        raise RuntimeError("创建临时邮箱响应缺少 address/jwt")
    return address, token


# xAI 的验证码可能是 123-456、123456、ABC-123 等形式，不能只认一种。
CODE_PATTERNS = (
    re.compile(r"\b([0-9]{3}-[0-9]{3})\b"),
    re.compile(r"\b([A-Z0-9]{3}-[A-Z0-9]{3})\b"),
    re.compile(r"(?<![0-9])([0-9]{6})(?![0-9])"),
    re.compile(r"\b([A-Z]{2,4}-[0-9]{3,4})\b"),
)


def extract_code(text: str) -> str:
    for pattern in CODE_PATTERNS:
        match = pattern.search(text)
        if match:
            return match.group(1)
    return ""


def fetch_code(context: BrowserContext, api_base: str, path: str, token: str, timeout: int = 180) -> str:
    deadline = time.time() + timeout
    last_status = None
    last_rows = None
    last_report = 0.0
    while time.time() < deadline:
        response = context.request.get(
            api_base.rstrip("/") + path,
            headers={"Authorization": "Bearer " + token},
            params={"limit": 20, "offset": 0},
        )
        if response.status < 400:
            try:
                payload = response.json()
            except Exception:
                payload = {}
            rows = payload.get("results") if isinstance(payload, dict) else None
            rows = rows or []
            last_status = response.status
            last_rows = len(rows)
            for row in rows or []:
                raw = str(row.get("raw") or row.get("text") or row.get("content") or "")
                code = extract_code(raw)
                if code:
                    emit("progress", f"已从邮件中提取验证码 {code}")
                    return code
            # 明确告知「邮箱是空的」，便于区分没发信和取信失败。
            now = time.time()
            if now - last_report >= 15:
                last_report = now
                emit("progress", f"等待验证码邮件，当前收件箱 {len(rows)} 封")
        else:
            # 取信接口出错要立刻暴露，而不是静默等到超时。
            body = ""
            try:
                body = response.text()[:200]
            except Exception:
                pass
            raise RuntimeError(f"读取临时邮箱失败: HTTP {response.status} {body}".strip())
        time.sleep(3)
    if last_rows == 0:
        raise RuntimeError("等待验证码邮件超时：收件箱始终为空，说明注册页并没有真的发出验证码邮件")
    raise RuntimeError(f"等待验证码邮件超时：收到 {last_rows} 封邮件但没有可识别的验证码")


CLICK_EMAIL_SIGNUP_JS = r"""
() => {
function isVisible(node) {
    if (!node) return false;
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}
function nodeText(node) {
    return [node.innerText, node.textContent, node.getAttribute('aria-label'), node.getAttribute('title'), node.getAttribute('href')]
        .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}
function scoreEntry(node) {
    const compact = nodeText(node).replace(/\s+/g, '');
    const lower = compact.toLowerCase();
    if (compact.includes('使用邮箱注册')) return 100;
    if (lower.includes('signupwithemail')) return 95;
    if (lower.includes('continuewithemail')) return 90;
    if (lower.includes('email') && (lower.includes('sign') || lower.includes('continue') || lower.includes('use') || lower.includes('with'))) return 80;
    if (lower === 'email' || lower.includes('邮箱')) return 70;
    return 0;
}
const candidates = Array.from(document.querySelectorAll('button, a, [role="button"]'))
    .filter((node) => isVisible(node) && !node.disabled && node.getAttribute('aria-disabled') !== 'true')
    .map((node) => ({ node, score: scoreEntry(node), text: nodeText(node) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
if (!candidates.length) return '';
candidates[0].node.click();
return candidates[0].text || 'clicked';
}
"""


def click_email_signup(page: Page) -> None:
    """用页面内 JS 按文本打分点击邮箱注册入口。

    直接按 selector 点容易误命中导航栏里的其它 email 元素。
    """
    deadline = time.time() + 60
    while time.time() < deadline:
        raise_if_blocked(page)
        clicked = page.evaluate(CLICK_EMAIL_SIGNUP_JS)
        if clicked:
            emit("progress", f"已点击邮箱注册入口（{clicked[:40]}）")
            page.wait_for_timeout(1500)
            return
        page.wait_for_timeout(800)
    raise RuntimeError("未找到「使用邮箱注册」按钮")


# 参考 grok-register 的做法：用页面内 JS 直接定位并写入邮箱，
# 再用文本打分点提交按钮。Playwright 的 locator 在 React 受控表单上不够稳。
EMAIL_FILL_JS = r"""
(email) => {
function isVisible(node) {
    if (!node) return false;
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}
function textOf(node) {
    return [
        node.innerText, node.textContent, node.getAttribute('aria-label'), node.getAttribute('title'),
        node.getAttribute('placeholder'), node.getAttribute('data-testid'), node.getAttribute('name'),
        node.getAttribute('id'), node.getAttribute('autocomplete')
    ].filter(Boolean).join(' ').replace(/\\s+/g, ' ').trim();
}
const direct = Array.from(document.querySelectorAll(
    'input[data-testid="email"], input[name="email"], input[type="email"], input[autocomplete="email"], input[placeholder*="mail" i], input[aria-label*="mail" i]'
));
for (const node of Array.from(document.querySelectorAll('input, textarea'))) {
    const type = (node.getAttribute('type') || '').toLowerCase();
    if (['hidden', 'submit', 'button', 'checkbox', 'radio', 'file', 'search'].includes(type)) continue;
    const meta = textOf(node).toLowerCase();
    if (meta.includes('email') || meta.includes('e-mail') || meta.includes('mail') || meta.includes('邮箱') || meta.includes('电子邮件')) direct.push(node);
}
const input = Array.from(new Set(direct)).find((node) => isVisible(node) && !node.disabled && !node.readOnly) || null;
if (!input) {
    const visibleInputs = Array.from(document.querySelectorAll('input, textarea'))
        .filter((node) => isVisible(node) && !node.disabled && !node.readOnly)
        .map((node) => [node.getAttribute('type'), node.getAttribute('name'), node.getAttribute('placeholder'), node.getAttribute('aria-label')].filter(Boolean).join('/'))
        .slice(0, 6);
    const visibleButtons = Array.from(document.querySelectorAll('button, a, [role="button"]'))
        .filter((node) => isVisible(node) && !node.disabled && node.getAttribute('aria-disabled') !== 'true')
        .map((node) => textOf(node).slice(0, 40))
        .filter(Boolean)
        .slice(0, 8);
    return JSON.stringify({ state: 'not-ready', inputs: visibleInputs, buttons: visibleButtons, url: location.href });
}
input.focus(); input.click();
const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
const tracker = input._valueTracker;
if (tracker) tracker.setValue('');
if (setter) setter.call(input, email); else input.value = email;
input.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, data: email, inputType: 'insertText' }));
input.dispatchEvent(new InputEvent('input', { bubbles: true, data: email, inputType: 'insertText' }));
input.dispatchEvent(new Event('change', { bubbles: true }));
input.blur();
return JSON.stringify({ state: 'filled', value: input.value || '' });
}
"""

EMAIL_SUBMIT_JS = r"""
() => {
function isVisible(node) {
    if (!node) return false;
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}
function textOf(node) {
    return [node.innerText, node.textContent, node.getAttribute('aria-label'), node.getAttribute('title')]
        .filter(Boolean).join(' ').replace(/\\s+/g, ' ').trim();
}
const buttons = Array.from(document.querySelectorAll('button[type="submit"], button, [role="button"], input[type="submit"]'))
    .filter((node) => isVisible(node) && !node.disabled && node.getAttribute('aria-disabled') !== 'true');
const target = buttons.find((node) => {
    const t = textOf(node).replace(/\\s+/g, '').toLowerCase();
    return t === '注册' || t.includes('注册') || t.includes('继续') || t.includes('下一步') || t.includes('确认')
        || t.includes('signup') || t.includes('sign up') || t.includes('continue') || t.includes('next')
        || t.includes('createaccount') || t.includes('submit');
});
if (target) { target.click(); return textOf(target) || 'button'; }
const input = Array.from(document.querySelectorAll('input')).find((n) => isVisible(n) && (n.getAttribute('type') || '').toLowerCase() === 'email');
const form = input && input.closest('form');
if (form) {
    if (form.requestSubmit) form.requestSubmit();
    else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    return 'form-submit';
}
if (input) {
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    return 'enter';
}
return '';
}
"""


def fill_email(page: Page, address: str) -> None:
    """填写邮箱并提交。

    与 grok-register 保持一致：邮箱步骤本身不等待 Turnstile，
    Turnstile 是后续资料步骤才需要处理的东西。
    """
    deadline = time.time() + 60
    last_reclick = 0.0
    last_snapshot: dict[str, Any] = {}
    while time.time() < deadline:
        raise_if_blocked(page)
        raw = page.evaluate(EMAIL_FILL_JS, address)
        try:
            state = json.loads(raw or "{}")
        except Exception:
            state = {}
        last_snapshot = state
        if state.get("state") == "filled":
            break
        # 页面刚加载完时首次点击可能落在尚未水合的元素上，
        # 与 grok-register 一致：输入框没出现就周期性重新触发邮箱入口。
        now = time.time()
        if now - last_reclick >= 3:
            last_reclick = now
            clicked = page.evaluate(CLICK_EMAIL_SIGNUP_JS)
            if clicked:
                emit("progress", f"邮箱输入框未出现，重新触发注册入口（{str(clicked)[:30]}）")
        page.wait_for_timeout(500)
    else:
        inputs = " | ".join((last_snapshot.get("inputs") or [])[:6]) or "none"
        buttons = " | ".join((last_snapshot.get("buttons") or [])[:8]) or "none"
        url = last_snapshot.get("url") or page.url
        raise RuntimeError(
            f"提交邮箱前未找到可用的邮箱输入框（url={url}; inputs={inputs}; buttons={buttons}）"
        )

    page.wait_for_timeout(600)
    clicked = page.evaluate(EMAIL_SUBMIT_JS)
    if not clicked:
        raise RuntimeError("邮箱输入框已填写，但页面上没有可用的提交按钮")
    emit("progress", f"已填写邮箱并提交（{clicked}）")


CODE_STEP_SELECTORS = (
    "input[maxlength='1']",
    "input[inputmode='numeric']",
    "input[autocomplete='one-time-code']",
    "input[name='code']",
)

# xAI 会在部分出口直接关闭邮箱注册，页面会明确写出这句话。
EMAIL_SIGNUP_UNAVAILABLE_MARKERS = (
    "email sign-up isn’t available",
    "email sign-up isn't available",
    "email signup isn't available",
    "sign up another way",
)

RATE_LIMIT_MARKERS = (
    "too many code requests",
    "please wait a few minutes",
    "too many requests",
)


def page_rate_limited(page: Page) -> bool:
    try:
        text = (page.inner_text("body") or "").lower()
    except Exception:
        return False
    return any(marker in text for marker in RATE_LIMIT_MARKERS)


CLOUDFLARE_BLOCK_MARKERS = (
    "you have been blocked",
    "unable to access x.ai",
    "attention required",
)


def page_cloudflare_blocked(page: Page) -> bool:
    try:
        text = (page.inner_text("body") or "").lower()
    except Exception:
        return False
    return any(marker in text for marker in CLOUDFLARE_BLOCK_MARKERS)


def raise_if_blocked(page: Page) -> None:
    if page_cloudflare_blocked(page):
        raise NonRetryableError(
            "Cloudflare 已拦截当前出口 IP（Sorry, you have been blocked）。"
            "请更换更干净的代理节点并等待一段时间后再试。"
        )


def email_signup_unavailable(page: Page) -> bool:
    try:
        text = (page.inner_text("body") or "").lower()
    except Exception:
        return False
    return any(marker in text for marker in EMAIL_SIGNUP_UNAVAILABLE_MARKERS)


def wait_for_code_step(page: Page, timeout: int = 90) -> None:
    """确认邮箱提交后真的进入了验证码步骤。

    没发信通常就发生在这里：提交按钮没点到、表单校验没过、或者上游直接
    报错。先把原因说清楚，再去轮询邮箱，避免白等三分钟。
    """
    deadline = time.time() + timeout
    started = time.time()
    while time.time() < deadline:
        raise_if_blocked(page)
        for selector in CODE_STEP_SELECTORS:
            locator = page.locator(selector).first
            if locator.count() and locator.is_visible():
                return
        # 验证码框已经出现就继续；否则限流时立刻停下，
        # 重复提交只会把冷却时间越拖越长。
        if page_rate_limited(page):
            raise NonRetryableError(
                "xAI 限制了验证码请求频率（Too many code requests）。"
                "这是按出口 IP 计数的，请等待几分钟后重试，或更换代理出口。"
            )
        # 给页面几秒渲染时间再判定域名被拒，避免把中间态误判成拒绝。
        if time.time() - started >= 6 and email_signup_unavailable(page):
            raise EmailDomainRejected("xAI 拒绝了当前收信域名")
        error_text = page.evaluate(
            """() => {
                const el = document.querySelector(
                    '[role=alert], [data-testid*=error], .error, .text-red-500, [class*=error]'
                );
                return el ? (el.innerText || '').trim().slice(0, 200) : '';
            }"""
        )
        if error_text:
            raise RuntimeError(f"提交邮箱后上游报错: {error_text}")
        page.wait_for_timeout(1000)

    # 收集现场证据，区分「人机验证没过」「上游报错」「域名被拒」三种情况。
    state = page.evaluate(
        """() => {
            const turnstile = document.querySelector('input[name="cf-turnstile-response"]');
            const body = (document.body.innerText || '').replace(/\\s+/g, ' ').trim();
            return {
                hasTurnstile: Boolean(turnstile),
                turnstileSolved: Boolean(turnstile && turnstile.value),
                text: body.slice(0, 300)
            };
        }"""
    ) or {}
    if state.get("hasTurnstile") and not state.get("turnstileSolved"):
        raise RuntimeError(
            "提交邮箱后未进入验证码页面：人机验证（Turnstile）没有通过。"
            "这通常是出口 IP 被判定为风险，请更换更干净的代理后重试。"
        )
    visible = str(state.get("text") or "").strip()
    if email_signup_unavailable(page):
        raise EmailDomainRejected(
            f"xAI 拒绝了当前收信域名。页面内容: {visible or '（空）'}"
        )
    raise RuntimeError(
        f"提交邮箱后未进入验证码页面（当前 URL={page.url}）。"
        f"页面可见内容: {visible or '（空）'}"
    )


def fill_code(page: Page, code: str) -> None:
    digits = code.replace("-", "")
    boxes = []
    candidates = page.locator("input[maxlength='1'], input[inputmode='numeric'], input[autocomplete='one-time-code']")
    for index in range(candidates.count()):
        element = candidates.nth(index)
        if element.is_visible():
            boxes.append(element)
    if len(boxes) >= len(digits):
        for box, digit in zip(boxes, digits):
            box.fill(digit)
        return
    locator = page.locator("input[inputmode=numeric], input[name=code], input[autocomplete=one-time-code]").first
    locator.fill(digits)
    page.keyboard.press("Enter")


def fill_profile(page: Page, profile: dict[str, str]) -> None:
    given = page.locator("input[name=givenName], input[autocomplete=given-name]").first
    given.wait_for(state="visible", timeout=60000)
    given.fill(profile["given"])
    family = page.locator("input[name=familyName], input[autocomplete=family-name]").first
    if family.count():
        family.fill(profile["family"])
    password = page.locator("input[name=password], input[type=password]").first
    if password.count():
        password.fill(random_password())
    for selector in [
        "button[type=submit]",
        "button:has-text('完成注册')",
        "button:has-text('Create account')",
        "button:has-text('Continue')",
        "button:has-text('继续')",
    ]:
        button = page.locator(selector).first
        if button.count() and button.is_visible():
            button.click()
            return
    raise RuntimeError("未找到资料提交按钮")


def wait_for_profile_page(page: Page, timeout: int = 90) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        for selector in ["input[name=givenName]", "input[autocomplete=given-name]", "input[name=password]", "input[type=password]"]:
            locator = page.locator(selector).first
            if locator.count() and locator.is_visible():
                return
        page.wait_for_timeout(1000)
    raise RuntimeError("资料页未出现")


def wait_for_turnstile(page: Page, timeout: int = 150) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        token = page.evaluate(
            """() => {
                const input = document.querySelector('input[name="cf-turnstile-response"]');
                if (input && input.value) return input.value;
                if (window.turnstile && typeof window.turnstile.getResponse === 'function') {
                    try { return window.turnstile.getResponse() || ''; } catch (e) { return ''; }
                }
                return '';
            }"""
        )
        if token:
            emit("progress", f"人机验证通过 token长度={len(token)}")
            return
        page.wait_for_timeout(2000)
    raise RuntimeError("Turnstile 验证超时")


def turnstile_present(page: Page) -> bool:
    try:
        return bool(
            page.evaluate(
                """() => Boolean(
                    document.querySelector('input[name="cf-turnstile-response"]') ||
                    document.querySelector('iframe[src*="challenges.cloudflare.com"]')
                )"""
            )
        )
    except Exception:
        return False


def read_sso(context: BrowserContext, page: Page, timeout: int = 180) -> str:
    deadline = time.time() + timeout
    emitted = False
    while time.time() < deadline:
        try:
            cookies = {cookie["name"]: cookie["value"] for cookie in context.cookies()}
        except Exception:
            cookies = {}
        sso = cookies.get("sso") or cookies.get("sso-rw")
        if sso:
            return sso
        if not emitted:
            try:
                emit(
                    "progress",
                    "等待 SSO 中；当前 URL=%s cookies=%s"
                    % (page.url, ",".join(sorted(cookies))[:200]),
                )
            except Exception:
                pass
            emitted = True
        page.wait_for_timeout(2000)
    raise RuntimeError("等待 SSO cookie 超时")


def convert_to_build(context: BrowserContext, page: Page, timeout: int = 180) -> dict[str, Any]:
    """Run the xAI Device Flow through real page interaction.

    The approve endpoint rejects plain HTTP clients because the consent page JS
    generates request-integrity fields. Clicking the real button does pass, so
    the whole flow is driven in-page.
    """
    device = context.request.post(
        DEVICE_CODE_URL,
        form={"client_id": BUILD_CLIENT_ID, "scope": BUILD_SCOPE},
    ).json()
    device_code = str(device.get("device_code") or "")
    user_code = str(device.get("user_code") or "")
    if not device_code or not user_code:
        raise RuntimeError("Device Flow 启动失败")

    verify = context.request.post(
        DEVICE_VERIFY_URL,
        form={"user_code": user_code},
        max_redirects=0,
    )
    consent_url = verify.headers.get("location")
    if not consent_url:
        raise RuntimeError("Device Flow 未返回 consent 地址")

    page.goto(consent_url, wait_until="domcontentloaded", timeout=90000)
    allow = page.locator("button[value=allow]").first
    if not allow.count():
        allow = page.locator("button[type=submit]").last
    allow.wait_for(state="visible", timeout=60000)
    allow.click()
    page.wait_for_timeout(4000)
    if "/oauth2/device/done" not in page.url:
        raise RuntimeError(f"Device Flow 授权未完成: {page.url}")

    interval = int(device.get("interval") or 5)
    expires_in = int(device.get("expires_in") or 600)
    deadline = time.time() + min(expires_in, timeout)
    while time.time() < deadline:
        payload = context.request.post(
            DEVICE_TOKEN_URL,
            form={
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                "client_id": BUILD_CLIENT_ID,
                "device_code": device_code,
            },
        ).json()
        access = str(payload.get("access_token") or "")
        if access:
            expires = int(payload.get("expires_in") or 3600)
            return {
                "access_token": access,
                "refresh_token": str(payload.get("refresh_token") or ""),
                "id_token": str(payload.get("id_token") or ""),
                "expires_in": expires,
                "expires_at": time.strftime(
                    "%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + expires)
                ),
            }
        error = str(payload.get("error") or "")
        if error in ("authorization_pending", "slow_down"):
            time.sleep(max(interval, 2))
            continue
        raise RuntimeError(f"Device Flow 换取 token 失败: {error or payload}")
    raise RuntimeError("Device Flow 等待 token 超时")


def run_one(payload: dict[str, Any], attempt: int = 1) -> dict[str, str]:
    proxy = str(payload.get("proxy") or "")
    headless = bool(payload.get("headless", True))
    launch: dict[str, Any] = {
        "headless": headless,
        "args": ["--no-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"],
    }
    channel = str(payload.get("channel") or "").strip()
    if channel:
        launch["channel"] = channel
    executable = str(payload.get("chromiumPath") or "").strip()
    if executable:
        launch["executable_path"] = executable
    proxy_descriptor = playwright_proxy(proxy)
    if proxy_descriptor:
        launch["proxy"] = proxy_descriptor
    with sync_playwright() as playwright:
        browser: Browser = playwright.chromium.launch(**launch)
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 900},
            locale="en-US",
            timezone_id="America/New_York",
        )
        # 去掉最常见的自动化指纹，降低 Turnstile 直接判为机器人的概率。
        context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });"
            "Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });"
            "Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });"
            "window.chrome = window.chrome || { runtime: {} };"
        )
        page = context.new_page()
        page.goto("https://accounts.x.ai/sign-up?redirect=grok-com", wait_until="domcontentloaded", timeout=90000)
        click_email_signup(page)
        emit("progress", "已进入注册页")
        raw_domains = order_domains(
            parse_domains(str(payload.get("defaultDomains") or "")),
            REJECTED_EMAIL_DOMAINS,
        ) or [""]
        address = ""
        mailbox_token = ""
        accepted = False
        rejection = ""
        for domain in raw_domains:
            address, mailbox_token = create_mailbox(
                context,
                str(payload.get("apiBase") or ""),
                str(payload.get("apiKey") or ""),
                str(payload.get("pathAccounts") or "/admin/new_address"),
                domain,
            )
            emit("progress", f"已创建邮箱 {address}", email=address)
            fill_email(page, address)
            try:
                wait_for_code_step(page)
                accepted = True
                break
            except EmailDomainRejected as exc:
                rejection = str(exc)
                REJECTED_EMAIL_DOMAINS.add(domain.lower())
                emit("progress", f"域名 {domain or '（默认）'} 被 xAI 拒绝，换下一个域名重试")
                # 页面仍停留在邮箱表单，直接换新地址重新提交即可。
                continue
        if not accepted:
            raise RuntimeError(f"所有收信域名都被 xAI 拒绝：{rejection or '无可用域名'}")
        emit("progress", "已提交邮箱，等待验证码邮件")
        debug_dir = str(payload.get("debugDir") or "").strip()
        if debug_dir:
            try:
                page.wait_for_timeout(3000)
                os.makedirs(debug_dir, exist_ok=True)
                page.screenshot(path=os.path.join(debug_dir, "after-email.png"), full_page=True)
                with open(os.path.join(debug_dir, "after-email.html"), "w", encoding="utf-8") as handle:
                    handle.write(page.content())
                emit("progress", f"已保存诊断快照到 {debug_dir}")
            except Exception as exc:  # noqa: BLE001
                emit("progress", f"诊断快照失败: {exc}")
        code = fetch_code(
            context,
            str(payload.get("apiBase") or ""),
            str(payload.get("pathMessages") or "/api/mails"),
            mailbox_token,
        )
        emit("progress", "已收到验证码", email=address)
        fill_code(page, code)
        page.wait_for_timeout(3000)
        if debug_dir:
            try:
                page.screenshot(path=os.path.join(debug_dir, "after-code.png"), full_page=True)
                with open(os.path.join(debug_dir, "after-code.html"), "w", encoding="utf-8") as handle:
                    handle.write(page.content())
            except Exception:
                pass
        wait_for_profile_page(page)
        wait_for_turnstile(page)
        profile = random_profile()
        fill_profile(page, profile)
        emit("progress", f"已提交资料 {profile['name']}", email=address)
        sso = read_sso(context, page)
        emit("account", "注册成功", email=address, sso=sso)
        if bool(payload.get("convertToBuild", True)):
            try:
                build = convert_to_build(context, page)
                emit(
                    "build",
                    "已转换为 Build 账号",
                    email=address,
                    access_token=build["access_token"],
                    refresh_token=build["refresh_token"],
                    id_token=build["id_token"],
                    expires_at=build["expires_at"],
                )
            except Exception as exc:  # noqa: BLE001
                emit("progress", f"转 Build 失败，保留 Web 账号: {exc}", email=address)
        context.close()
        browser.close()
        return {"email": address, "sso": sso}


def main() -> int:
    config = payload()
    count = int(config.get("count") or 1)
    max_attempts = max(1, int(config.get("attempts") or 2))
    for index in range(count):
        emit("progress", f"开始第 {index + 1}/{count} 个账号")
        last_error = ""
        for attempt in range(1, max_attempts + 1):
            try:
                run_one(config, attempt)
                last_error = ""
                break
            except NonRetryableError as exc:
                # 频率限制/策略拒绝，立即重试只会让冷却更久。
                last_error = str(exc)
                emit("progress", f"第 {attempt}/{max_attempts} 次尝试失败: {last_error}")
                break
            except Exception as exc:
                last_error = str(exc)
                emit("progress", f"第 {attempt}/{max_attempts} 次尝试失败: {last_error}")
        if last_error:
            emit("error", last_error)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
