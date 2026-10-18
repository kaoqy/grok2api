import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { diagnoseRegistrationFailure } from "./registration-diagnostics.ts";

describe("diagnoseRegistrationFailure", () => {
  it("prioritizes the headless-browser diagnosis over a domain diagnosis", () => {
    assert.equal(
      diagnoseRegistrationFailure([
        "域名 example.com 被 xAI 拒绝",
        "xAI 对无头 Chromium 返回了 Email sign-up isn't available right now",
      ]),
      "headless",
    );
  });

  it("detects a blocked proxy IP", () => {
    assert.equal(
      diagnoseRegistrationFailure(["ERROR: Cloudflare 已拦截当前出口 IP（Sorry, you have been blocked）"]),
      "cloudflare",
    );
  });

  it("detects verification-code rate limiting", () => {
    assert.equal(
      diagnoseRegistrationFailure(["xAI 限制了验证码请求频率（Too many code requests）"]),
      "rate_limit",
    );
  });

  it("detects that the mailbox never received a message", () => {
    assert.equal(
      diagnoseRegistrationFailure(["等待验证码邮件超时：收件箱始终为空"]),
      "mail_not_sent",
    );
  });

  it("returns none when there is no failure", () => {
    assert.equal(diagnoseRegistrationFailure(["开始第 1/1 个账号", "已进入注册页"]), "none");
  });
});
