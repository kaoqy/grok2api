import { apiRequest } from "@/shared/api/client";
import { createObjectDecoder, isBoolean, isNumber, isOptional, isString } from "@/shared/api/decoder";

export type AccountImportKeyStatusDTO = {
  configured: boolean;
  endpoint: string;
};

export type AccountImportKeyDTO = AccountImportKeyStatusDTO & {
  token: string;
};

export type BuildAccountImportInput = {
  email: string;
  name?: string;
  clientId?: string;
  accessToken: string;
  refreshToken: string;
  idToken?: string;
  expiresAt?: string;
  proxyName?: string;
  proxyUrl: string;
};

export type BuildAccountImportResultDTO = {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  accountId?: string;
  accountIds: string[];
  egressNodeId: string;
  egressNodeName: string;
  proxyDisplay: string;
  reusedEgressNode: boolean;
};

const decodeKeyStatus = createObjectDecoder<AccountImportKeyStatusDTO>("account import key status", {
  configured: isBoolean,
  endpoint: isString,
});

const decodeKey = createObjectDecoder<AccountImportKeyDTO>("account import key", {
  configured: isBoolean,
  endpoint: isString,
  token: isString,
});

const decodeImportResult = createObjectDecoder<BuildAccountImportResultDTO>("Build account import", {
  created: isNumber,
  updated: isNumber,
  skipped: isNumber,
  failed: isNumber,
  accountId: isOptional(isString),
  accountIds: (value) => Array.isArray(value) && value.every(isString),
  egressNodeId: isString,
  egressNodeName: isString,
  proxyDisplay: isString,
  reusedEgressNode: isBoolean,
});

export function getAccountImportKeyStatus(): Promise<AccountImportKeyStatusDTO> {
  return apiRequest("/api/admin/v1/account-imports/key", {}, decodeKeyStatus);
}

export function rotateAccountImportKey(): Promise<AccountImportKeyDTO> {
  return apiRequest("/api/admin/v1/account-imports/key", { method: "POST" }, decodeKey);
}

export function revokeAccountImportKey(): Promise<AccountImportKeyStatusDTO> {
  return apiRequest("/api/admin/v1/account-imports/key", { method: "DELETE" }, decodeKeyStatus);
}

export function importBuildAccount(input: BuildAccountImportInput): Promise<BuildAccountImportResultDTO> {
  return apiRequest("/api/admin/v1/account-imports/build", { method: "POST", body: input }, decodeImportResult);
}
