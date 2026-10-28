import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import no from "../../messages/no.json";
import { WEBSITE_CLIENT_NAMESPACES, pickMessages } from "./clientMessages";

describe("pickMessages (WEB-01 phase 0)", () => {
  const messages = { common: { appName: "FairPlayr", save: "Save" }, marketing: { placeholder: { title: "T" }, video: { play: "Play" } }, team: { x: "y" } };

  it("picks whole and dotted namespaces, nested as in the file", () => {
    expect(pickMessages(messages, ["common"])).toEqual({ common: { appName: "FairPlayr", save: "Save" } });
    expect(pickMessages(messages, ["marketing.video", "common.appName"])).toEqual({ marketing: { video: { play: "Play" } }, common: { appName: "FairPlayr" } });
    expect(pickMessages(messages, ["marketing.video", "marketing.placeholder"])).toEqual({ marketing: messages.marketing });
    expect(pickMessages(messages, [])).toEqual({});
  });

  it("throws on an unknown namespace", () => {
    expect(() => pickMessages(messages, ["marketting"])).toThrow("Unknown message namespace: marketting");
    expect(() => pickMessages(messages, ["common.appName.x"])).toThrow();
  });

  it("the website sends no messages to the browser in phase 0, and every listed namespace exists in both languages", () => {
    expect(WEBSITE_CLIENT_NAMESPACES).toEqual([]);
    expect(() => pickMessages(en, WEBSITE_CLIENT_NAMESPACES)).not.toThrow();
    expect(() => pickMessages(no, WEBSITE_CLIENT_NAMESPACES)).not.toThrow();
  });
});
