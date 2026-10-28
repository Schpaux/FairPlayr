import { describe, expect, it } from "vitest";
import { APP_HOME_PATH, PWA_START_URL, isPwaLaunch } from "./appRoutes";

describe("app routes", () => {
  it("put the app's Home at /play and start installed apps there", () => {
    expect(APP_HOME_PATH).toBe("/play");
    expect(PWA_START_URL).toBe("/play?source=pwa");
  });

  it("recognise an installed app's launch by its marker only", () => {
    expect(isPwaLaunch(new URLSearchParams("source=pwa"))).toBe(true);
    expect(isPwaLaunch(new URLSearchParams("x=1&source=pwa"))).toBe(true);
    expect(isPwaLaunch(new URLSearchParams(""))).toBe(false);
    expect(isPwaLaunch(new URLSearchParams("source=web"))).toBe(false);
    expect(isPwaLaunch(new URLSearchParams("source=PWA"))).toBe(false);
    expect(isPwaLaunch(new URLSearchParams("utm_source=pwa"))).toBe(false);
  });
});
