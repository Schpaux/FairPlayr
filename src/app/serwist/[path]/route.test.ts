// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

// The worker's config banner, checked without a build: createSerwistRoute is
// replaced by a spy that records what the route would bundle with.
const serwist = vi.hoisted(() => ({
  options: [] as { esbuildOptions?: { banner?: { js?: string }; sourcemap?: unknown } }[],
}));
vi.mock("@serwist/turbopack", () => ({
  createSerwistRoute: (options: (typeof serwist.options)[number]) => {
    serwist.options.push(options);
    return { GET: async () => new Response("// sw") };
  },
}));

async function bannerFor(value: string | undefined) {
  vi.resetModules();
  serwist.options.length = 0;
  if (value === undefined) vi.stubEnv("NEXT_PUBLIC_FP_SW", "");
  else vi.stubEnv("NEXT_PUBLIC_FP_SW", value);
  const route = await import("./route");
  await route.GET(new Request("http://localhost/serwist/sw.js"), { params: Promise.resolve({ path: "sw.js" }) });
  return serwist.options[0]?.esbuildOptions;
}

describe("serwist route config banner", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds the kill-switch worker when NEXT_PUBLIC_FP_SW=off", async () => {
    const options = await bannerFor("off");
    expect(options?.banner?.js).toContain('"mode":"off"');
    expect(options?.sourcemap).toBe(false);
  });

  it("builds the normal worker otherwise", async () => {
    expect((await bannerFor(undefined))?.banner?.js).toContain('"mode":"on"');
    expect((await bannerFor("on"))?.banner?.js).toContain('"mode":"on"');
  });

  it("only serves sw.js", async () => {
    const route = await import("./route");
    expect(route.generateStaticParams()).toEqual([{ path: "sw.js" }]);
  });
});
