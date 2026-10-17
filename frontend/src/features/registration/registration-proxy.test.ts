import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { chooseRegistrationProxy } from "./registration-proxy.ts";

describe("chooseRegistrationProxy", () => {
  const nodes = [
    { id: "unknown", probeStatus: "unknown" as const },
    { id: "healthy", probeStatus: "healthy" as const },
    { id: "unhealthy", probeStatus: "unhealthy" as const },
  ];

  it("keeps the current proxy while it remains available", () => {
    assert.equal(chooseRegistrationProxy("unknown", nodes), "unknown");
  });

  it("prefers a healthy proxy when no valid proxy is selected", () => {
    assert.equal(chooseRegistrationProxy("", nodes), "healthy");
  });

  it("falls back to the first available proxy when none is healthy", () => {
    assert.equal(
      chooseRegistrationProxy("missing", nodes.filter((node) => node.probeStatus !== "healthy")),
      "unknown",
    );
  });
});
