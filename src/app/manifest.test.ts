import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("web app manifest (OFF-02, WEB-01d)", () => {
  it("keeps the installed app's identity and scope, and starts at the app's Home", () => {
    const value = manifest();
    // Changing id or scope makes existing installs a different app.
    expect(value.id).toBe("/");
    expect(value.scope).toBe("/");
    expect(value.start_url).toBe("/play?source=pwa");
    expect(value.display).toBe("standalone");
  });
});
