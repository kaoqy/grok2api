import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  headedBrowserEnabled,
  headlessFromHeadedToggle,
} from "./registration-mode.ts";

describe("registration browser mode", () => {
  it("shows the headed-browser switch as enabled when the API requests headed mode", () => {
    assert.equal(headedBrowserEnabled(false), true);
  });

  it("shows the headed-browser switch as disabled when the API requests headless mode", () => {
    assert.equal(headedBrowserEnabled(true), false);
  });

  it("maps turning the headed-browser switch off to headless mode", () => {
    assert.equal(headlessFromHeadedToggle(false), true);
  });
});
