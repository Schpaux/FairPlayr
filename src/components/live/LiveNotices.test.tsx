import { act, cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveNotices, type LiveNoticesProps } from "@/components/live/LiveNotices";
import type { LiveBandItem } from "@/components/live/liveBand";
import { Notice } from "@/components/ui/primitives/Notice";
import en from "../../../messages/en.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

type Box = { left: number; top: number; right: number; bottom: number };
const boxes = new Map<Element, Box>();
const box = (left: number, top: number, width: number, height: number): Box => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

let resizeCallbacks: (() => void)[] = [];

class FakeResizeObserver {
  constructor(callback: () => void) {
    resizeCallbacks.push(callback);
  }
  observe() {}
  disconnect() {}
}

const BASE: LiveNoticesProps = {
  error: null,
  pendingCompletion: null,
  isOnline: true,
  isSyncingCompletion: false,
  onRetryCompletion: () => undefined,
  syncedMatchId: null,
  onOpenReport: () => undefined,
  endedLocally: null,
};

function item(key: string, tone: LiveBandItem["tone"], text: string): LiveBandItem {
  return {
    key,
    tone,
    announcement: text,
    render: () => (
      <Notice tone={tone} testId={`notice-${key}`}>
        {text}
      </Notice>
    ),
  };
}

/** Live root > [header, pitch > [tokens…, band]], with fixed boxes. */
function renderInPitch(band: LiveBandItem[], tokenBoxes: Box[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <div data-testid="root">
        <header />
        <div data-testid="pitch">
          {tokenBoxes.map((_, index) => (
            <button key={index} type="button" data-player-id={`p${index}`} />
          ))}
          <LiveNotices {...BASE} band={band} />
        </div>
      </div>
    </NextIntlClientProvider>
  );
}

function layout(tokenBoxes: Box[], noticeBox: Box) {
  boxes.clear();
  boxes.set(document.querySelector("header")!, box(0, 0, 375, 140));
  boxes.set(screen.getByTestId("pitch"), box(0, 140, 375, 360));
  document.querySelectorAll("[data-player-id]").forEach((element, index) => boxes.set(element, tokenBoxes[index]));
  const notice = screen.getByTestId("live-notice-band").firstElementChild!;
  boxes.set(notice, noticeBox);
}

describe("LiveNotices band (DESIGN.md §5.6)", () => {
  beforeEach(() => {
    resizeCallbacks = [];
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const value = boxes.get(this) ?? box(0, 0, 0, 0);
      return { ...value, x: value.left, y: value.top, width: value.right - value.left, height: value.bottom - value.top, toJSON: () => value } as DOMRect;
    });
  });

  afterEach(() => {
    cleanup();
    boxes.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows only the most severe message", () => {
    renderInPitch([item("restoredMatch", "info", "closed 7 min"), item("storageError", "error", "not saved")], []);

    expect(screen.getAllByTestId("live-notice-band")).toHaveLength(1);
    expect(screen.getByTestId("notice-storageError")).toBeTruthy();
    expect(screen.queryByTestId("notice-restoredMatch")).toBeNull();
  });

  it("is hidden (no pointer events, announced instead) when it would cover any token, and re-checks on resize", () => {
    const tokens = [box(160, 230, 56, 70), box(40, 330, 56, 70)];
    renderInPitch([item("storageError", "error", "not saved")], tokens);

    // The bench grew to two rows: the pitch is shorter and the notice now
    // reaches the lower token as well as the top-most one.
    layout(tokens, box(12, 152, 351, 90));
    act(() => resizeCallbacks.forEach((callback) => callback()));
    const band = screen.getByTestId("live-notice-band");
    expect(band.getAttribute("data-fits")).toBe("false");
    expect(band.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("alert").textContent).toBe("not saved");

    // Back to one row: it fits again over the grass.
    layout([box(160, 260, 56, 70), box(40, 360, 56, 70)], box(12, 152, 351, 90));
    act(() => resizeCallbacks.forEach((callback) => callback()));
    expect(band.getAttribute("data-fits")).toBe("true");
    expect(band.getAttribute("aria-hidden")).toBeNull();
  });

  it("no wordless cue: when hidden, nothing is offered in the band", () => {
    renderInPitch([item("restoredMatch", "info", "closed 7 min")], [box(12, 150, 56, 70)]);
    layout([box(12, 150, 56, 70)], box(12, 152, 351, 50));
    act(() => resizeCallbacks.forEach((callback) => callback()));

    expect(screen.getByTestId("live-notice-band").getAttribute("data-fits")).toBe("false");
    expect(screen.queryAllByRole("button").filter((button) => !button.hasAttribute("data-player-id"))).toHaveLength(0);
    expect(screen.getByRole("status").textContent).toBe("closed 7 min");
  });
});
