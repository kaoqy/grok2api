import { apiRequest } from "@/shared/api/client";
import { createObjectDecoder, hasShape, isArrayOf, isBoolean, isNumber, isOptional, isString, type ValueValidator } from "@/shared/api/decoder";

// 后端把 uint64 以 JSON number 返回，历史前端类型写成 string，
// 这里两种都接受，避免解码失败导致整页静默空白。
const isIdLike: ValueValidator = (value) =>
  typeof value === "string" || (typeof value === "number" && Number.isFinite(value));

export type RegistrationResult = {
  email?: string;
  accountId?: string | number;
  buildId?: string | number;
  message?: string;
  error?: string;
  converted?: boolean;
};

export type RegistrationStatus = {
  running: boolean;
  target: number;
  completed: number;
  success: number;
  failed: number;
  imported: number;
  converted: number;
  runId: string;
  proxyNodeId: string | number;
  proxyNodeName: string;
  startedAt?: string;
  finishedAt?: string;
  lastMessage?: string;
  error?: string;
  results: RegistrationResult[];
  todayStarted: number;
  todaySuccess: number;
  todayFailed: number;
  todayConverted: number;
  autoEnabled: boolean;
  dailyTarget: number;
  scheduledAt?: string;
};

export type RegistrationSettings = {
  enabled: boolean;
  autoEnabled: boolean;
  dailyTarget: number;
  headless: boolean;
  mailBase: string;
  mailToken: string;
  mailPath: string;
  mailDomains: string;
  mailReady: boolean;
};

// mailReady 由服务端计算，提交时无需回传。
export type RegistrationSettingsInput = Omit<RegistrationSettings, "mailReady">;

const resultShape = {
  email: isOptional(isString),
  accountId: isOptional(isIdLike),
  buildId: isOptional(isIdLike),
  message: isOptional(isString),
  error: isOptional(isString),
  converted: isOptional(isBoolean),
};

const statusShape = {
  running: isBoolean,
  target: isNumber,
  completed: isNumber,
  success: isNumber,
  failed: isNumber,
  imported: isNumber,
  converted: isNumber,
  runId: isString,
  proxyNodeId: isIdLike,
  proxyNodeName: isString,
  startedAt: isOptional(isString),
  finishedAt: isOptional(isString),
  lastMessage: isOptional(isString),
  error: isOptional(isString),
  results: isArrayOf(hasShape(resultShape)),
  todayStarted: isNumber,
  todaySuccess: isNumber,
  todayFailed: isNumber,
  todayConverted: isNumber,
  autoEnabled: isBoolean,
  dailyTarget: isNumber,
  scheduledAt: isOptional(isString),
};

const settingsShape = {
  enabled: isBoolean,
  autoEnabled: isBoolean,
  dailyTarget: isNumber,
  headless: isBoolean,
  mailBase: isString,
  mailToken: isString,
  mailPath: isString,
  mailDomains: isString,
  mailReady: isBoolean,
};

// apiRequest 已经把响应外层 data 解包后再交给解码器，
// 因此这里校验的是解包后的业务对象本身。
const decodeStatus = createObjectDecoder<RegistrationStatus>("registration status", statusShape);
const decodeLogs = createObjectDecoder<{ entries: string[] }>("registration logs", { entries: isArrayOf(isString) });
const decodeStop = createObjectDecoder<{ stopped: boolean }>("registration stop", { stopped: isBoolean });
const decodeSettings = createObjectDecoder<RegistrationSettings>("registration settings", settingsShape);

export async function getRegistrationStatus(): Promise<RegistrationStatus> {
  return apiRequest("/api/admin/v1/registration/status", { retryAuth: false }, decodeStatus);
}

export async function getRegistrationLogs(): Promise<string[]> {
  return (await apiRequest("/api/admin/v1/registration/logs", { retryAuth: false }, decodeLogs)).entries;
}

export async function startRegistration(count: number, proxyNodeId: string): Promise<RegistrationStatus> {
  return apiRequest("/api/admin/v1/registration/start", { method: "POST", body: { count, proxyNodeId } }, decodeStatus);
}

export async function stopRegistration(): Promise<void> {
  await apiRequest("/api/admin/v1/registration/stop", { method: "POST" }, decodeStop);
}

export async function getRegistrationSettings(): Promise<RegistrationSettings> {
  return apiRequest("/api/admin/v1/registration/settings", { retryAuth: false }, decodeSettings);
}

export async function updateRegistrationSettings(settings: RegistrationSettingsInput): Promise<RegistrationSettings> {
  return apiRequest("/api/admin/v1/registration/settings", { method: "PUT", body: settings }, decodeSettings);
}
