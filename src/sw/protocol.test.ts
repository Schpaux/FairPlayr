import { describe, expect, it } from "vitest";
import { MESSAGE, isSwStatus, parseClientMessage, readSwConfig, swConfigBanner } from "./protocol";

describe("protocol", () => {
  it("accepts only known, well-formed messages", () => {
    expect(parseClientMessage({ type: "SKIP_WAITING" })).toEqual({ type: "SKIP_WAITING" });
    expect(parseClientMessage({ type: MESSAGE.setLocale, locale: "no" })).toEqual({ type: MESSAGE.setLocale, locale: "no" });
    expect(parseClientMessage({ type: MESSAGE.setLocale, locale: "de" })).toBeNull();
    expect(parseClientMessage({ type: MESSAGE.getStatus })).toEqual({ type: MESSAGE.getStatus });
    expect(parseClientMessage({ type: MESSAGE.setMatchActive, active: true })).toEqual({ type: MESSAGE.setMatchActive, active: true });
    expect(parseClientMessage({ type: MESSAGE.setMatchActive, active: "yes" })).toBeNull();
    expect(parseClientMessage({ type: MESSAGE.setMatchActive })).toBeNull();
    expect(parseClientMessage({ type: MESSAGE.allowUpdateOnce })).toEqual({ type: MESSAGE.allowUpdateOnce });
    expect(parseClientMessage({ type: "CLEAR_ALL" })).toBeNull();
    expect(parseClientMessage("SKIP_WAITING")).toBeNull();
    expect(parseClientMessage(null)).toBeNull();
  });

  it("builds and reads the config banner", () => {
    const banner = swConfigBanner({ buildId: "b1", mode: "off" });
    expect(banner).toBe('self.__FP_SW_CONFIG__={"buildId":"b1","mode":"off"};');
    const scope: Record<string, unknown> = {};
    new Function("self", banner)(scope);
    expect(readSwConfig(scope.__FP_SW_CONFIG__)).toEqual({ buildId: "b1", mode: "off" });
  });

  it("defaults a missing or odd config to on", () => {
    expect(readSwConfig(undefined)).toEqual({ buildId: "unknown", mode: "on" });
    expect(readSwConfig({ buildId: 3, mode: "maybe" })).toEqual({ buildId: "unknown", mode: "on" });
  });

  it("recognises a status reply", () => {
    expect(isSwStatus({ type: MESSAGE.status, buildId: "b", precacheName: "fp-precache-b" })).toBe(true);
    expect(isSwStatus({ type: "x" })).toBe(false);
  });
});
