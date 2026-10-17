import { apiRequest } from "@/shared/api/client";
import { createObjectDecoder, hasShape, isBoolean } from "@/shared/api/decoder";

const decodeSetupStatus = createObjectDecoder<{ setupRequired: boolean }>("setup status", {
  setupRequired: isBoolean,
});

export function getSetupStatus(): Promise<{ setupRequired: boolean }> {
  return apiRequest("/api/admin/v1/auth/setup", { authenticated: false, retryAuth: false }, decodeSetupStatus);
}

export const setupStatusShape = hasShape({ setupRequired: isBoolean });
