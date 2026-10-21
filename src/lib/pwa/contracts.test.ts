import { describe, expect, it } from "vitest";
import { registrationAction, resolveSwMode } from "./contracts";

describe("service worker contract", () => {
  it("reads the kill switch", () => {
    expect(resolveSwMode("off")).toBe("off");
    expect(resolveSwMode(" OFF ")).toBe("off");
    expect(resolveSwMode("0")).toBe("off");
    expect(resolveSwMode(undefined)).toBe("on");
    expect(resolveSwMode("on")).toBe("on");
  });

  it("registers in production only, unless opted in; always unregisters when off", () => {
    expect(registrationAction({ nodeEnv: "production", mode: "on", devOptIn: undefined })).toBe("register");
    expect(registrationAction({ nodeEnv: "development", mode: "on", devOptIn: undefined })).toBe("skip");
    expect(registrationAction({ nodeEnv: "test", mode: "on", devOptIn: undefined })).toBe("skip");
    expect(registrationAction({ nodeEnv: "development", mode: "on", devOptIn: "1" })).toBe("register");
    expect(registrationAction({ nodeEnv: "production", mode: "off", devOptIn: undefined })).toBe("unregister");
    expect(registrationAction({ nodeEnv: "development", mode: "off", devOptIn: undefined })).toBe("unregister");
  });
});
