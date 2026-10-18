export type RegistrationFailureKind =
  | "none"
  | "headless"
  | "cloudflare"
  | "rate_limit"
  | "domain_rejected"
  | "mail_not_sent"
  | "conversion"
  | "timeout"
  | "browser"
  | "unknown";

function includesAny(value: string, markers: string[]): boolean {
  return markers.some((marker) => value.includes(marker));
}

export function diagnoseRegistrationFailure(entries: string[]): RegistrationFailureKind {
  const text = entries.slice(-200).join("\n").toLowerCase();
  if (!text.trim()) return "none";
  if (includesAny(text, ["无头 chromium", "无头模式", "headless mode"])) return "headless";
  if (includesAny(text, ["you have been blocked", "cloudflare 已拦截", "unable to access x.ai"])) return "cloudflare";
  if (includesAny(text, ["too many code requests", "验证码请求频率", "too many requests"])) return "rate_limit";
  if (includesAny(text, ["所有收信域名都被 xai 拒绝", "xai 拒绝了当前收信域名"])) return "domain_rejected";
  if (includesAny(text, ["收件箱始终为空", "验证码邮件超时", "mailbox polling timed out"])) return "mail_not_sent";
  if (includesAny(text, ["转 build 失败", "转换 build", "convert to build"])) return "conversion";
  if (includesAny(text, ["timeout", "timed out", "超时"])) return "timeout";
  if (includesAny(text, ["browsertype.launch", "target page, context or browser has been closed", "browser has been closed"])) return "browser";
  if (includesAny(text, ["error:", "失败", "failed"])) return "unknown";
  return "none";
}
