import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

let online = true;

describe("useOnlineStatus", () => {
  beforeEach(() => {
    online = true;
    vi.spyOn(window.navigator, "onLine", "get").mockImplementation(() => online);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads the current navigator.onLine value", () => {
    online = false;
    const { result } = renderHook(() => useOnlineStatus());

    expect(result.current).toBe(false);
  });

  it("follows window online/offline events", () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);

    online = false;
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current).toBe(false);

    online = true;
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current).toBe(true);
  });

  it("assumes online during server rendering", () => {
    online = false;

    function Probe() {
      return createElement("span", null, useOnlineStatus() ? "online" : "offline");
    }

    expect(renderToString(createElement(Probe))).toContain("online");
  });

  it("removes its event listeners on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useOnlineStatus());

    unmount();

    const removed = removeSpy.mock.calls.map(([type]) => type);
    expect(removed).toContain("online");
    expect(removed).toContain("offline");
  });
});
