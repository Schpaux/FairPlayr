import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("web app manifest (OFF-02, WEB-01d)", () => {
  it("keeps the installed app's identity, scope and start_url", () => {
    const value = manifest();
    // Changing id or scope makes existing installs a different app.
    expect(value.id).toBe("/");
    expect(value.scope).toBe("/");
    // A launch at / opens Home in the coach's language; /play?source=pwa would be English Home offline.
    expect(value.start_url).toBe("/?source=pwa");
    expect(value.display).toBe("standalone");
  });
});
