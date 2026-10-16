import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Bench } from "@/components/live/Bench";
import type { LiveBenchView, LiveScreenModel } from "@/components/live/liveScreenModel";
import no from "../../../messages/no.json";

// FP-MS2.1-B2: the bench is sorted least-played first, holds its order while
// the coach is mid-interaction or touching / scrolling it, re-sorts once
// afterwards, and its rail buttons reach both ends. jsdom has no layout, so
// the rail geometry is stubbed: 2 rows, 90px columns, a 360px wide rail.

const COLUMN_PX = 90;
const TILE_PX = 86;
const RAIL_PX = 360;

type Tile = Pick<LiveBenchView, "playerId" | "minutes"> & Partial<LiveBenchView>;

function benchOf(tiles: Tile[]): LiveBenchView[] {
  return tiles.map((tile, index) => ({
    name: tile.playerId,
    number: null,
    squadIndex: index,
    ...tile,
  }));
}

function modelOf(bench: LiveBenchView[], overrides: Partial<LiveScreenModel> = {}): LiveScreenModel {
  return {
    bench,
    interactionActive: false,
    selectedFieldPlayerId: null,
    draggingBenchPlayerId: null,
    strip: "idle",
    suggestion: null,
    ...overrides,
  } as LiveScreenModel;
}

let overflowing = false;
let scrollLeft = 0;

function maxScroll(count: number) {
  return Math.max(0, Math.ceil(count / 2) * COLUMN_PX - RAIL_PX);
}

beforeEach(() => {
  overflowing = false;
  scrollLeft = 0;
  const rail = () => document.querySelector<HTMLElement>('[data-testid="live-bench"]');
  const count = () => rail()?.querySelectorAll("[data-bench-player-id]").length ?? 0;
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.dataset.testid === "live-bench" && overflowing ? RAIL_PX + maxScroll(count()) : 0;
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.dataset.testid === "live-bench" ? RAIL_PX : 0;
  });
  vi.spyOn(Element.prototype, "scrollLeft", "get").mockImplementation(function (this: Element) {
    return (this as HTMLElement).dataset?.testid === "live-bench" ? scrollLeft : 0;
  });
  vi.spyOn(Element.prototype, "scrollLeft", "set").mockImplementation(function (this: Element, value: number) {
    if ((this as HTMLElement).dataset?.testid === "live-bench") scrollLeft = value;
  });
  Element.prototype.scrollTo = vi.fn(function (this: Element, options?: ScrollToOptions | number) {
    const left = typeof options === "object" ? (options.left ?? 0) : 0;
    scrollLeft = Math.max(0, Math.min(left, maxScroll(count())));
    fireEvent.scroll(this);
  }) as unknown as typeof Element.prototype.scrollTo;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const el = this as HTMLElement;
    if (el.dataset?.testid === "live-bench") return DOMRect.fromRect({ x: 0, y: 0, width: RAIL_PX, height: 92 });
    const id = el.dataset?.benchPlayerId;
    if (id && el.closest('[data-testid="live-bench"]')) {
      const index = [...el.parentElement!.children].indexOf(el);
      const x = Math.floor(index / 2) * COLUMN_PX - scrollLeft;
      return DOMRect.fromRect({ x, y: (index % 2) * 48, width: TILE_PX, height: 44 });
    }
    return DOMRect.fromRect({ x: 0, y: 0, width: 40, height: 17 });
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderBench(model: LiveScreenModel, handlers: Partial<Parameters<typeof Bench>[0]> = {}) {
  const props = {
    model,
    disabled: false,
    flashedPlayerId: null,
    onTapBenchPlayer: vi.fn(),
    onBenchPointerDown: vi.fn(),
    ...handlers,
  };
  const view = render(
    <NextIntlClientProvider locale="no" messages={no}>
      <Bench {...props} />
    </NextIntlClientProvider>
  );
  const rerender = (next: LiveScreenModel) =>
    view.rerender(
      <NextIntlClientProvider locale="no" messages={no}>
        <Bench {...props} model={next} />
      </NextIntlClientProvider>
    );
  return { ...view, props, rerender };
}

const shown = () =>
  [...document.querySelectorAll<HTMLElement>('[data-testid="live-bench"] [data-bench-player-id]')].map(
    (el) => el.dataset.benchPlayerId
  );
const rail = () => screen.getByTestId("live-bench");

describe("Bench order", () => {
  it("renders nothing with no substitutes", () => {
    renderBench(modelOf([]));
    expect(screen.queryByTestId("live-bench")).toBeNull();
  });

  for (const count of [1, 5, 8, 9, 11, 15]) {
    it(`shows ${count} substitutes least-played first, ties in squad order`, () => {
      const cycle = [12, 0, 8, 4, 0];
      const bench = benchOf(Array.from({ length: count }, (_, i) => ({ playerId: `b${i + 1}`, minutes: cycle[i % 5] })));
      renderBench(modelOf(bench));
      const expected = [...bench]
        .sort((a, b) => a.minutes - b.minutes || a.squadIndex - b.squadIndex)
        .map((tile) => tile.playerId);
      expect(shown()).toEqual(expected);
    });
  }

  it("taps and pointer-downs report the player id of the tile, not its position", () => {
    const { props } = renderBench(
      modelOf(benchOf([{ playerId: "b1", minutes: 8 }, { playerId: "b2", minutes: 0 }, { playerId: "b3", minutes: 4 }]))
    );
    expect(shown()).toEqual(["b2", "b3", "b1"]);
    const tiles = rail().querySelectorAll("button");
    fireEvent.click(tiles[0]);
    fireEvent.click(tiles[2]);
    expect(props.onTapBenchPlayer).toHaveBeenNthCalledWith(1, "b2");
    expect(props.onTapBenchPlayer).toHaveBeenNthCalledWith(2, "b1");
    fireEvent.pointerDown(tiles[1]);
    expect(props.onBenchPointerDown).toHaveBeenCalledWith("b3", expect.anything(), { directionLock: false });
  });

  it("holds the order during an interaction; the incoming player takes the outgoing slot; re-sorts once after", () => {
    const start = benchOf([
      { playerId: "a", minutes: 0 },
      { playerId: "b", minutes: 4 },
      { playerId: "c", minutes: 8 },
    ]);
    const { rerender } = renderBench(modelOf(start));
    expect(shown()).toEqual(["a", "b", "c"]);

    // A pitch player is selected, then a goes on and Maja (16′) comes off.
    rerender(modelOf(start, { interactionActive: true, selectedFieldPlayerId: "maja" }));
    const afterSwap = benchOf([
      { playerId: "maja", minutes: 16, squadIndex: 0 },
      { playerId: "b", minutes: 4, squadIndex: 2 },
      { playerId: "c", minutes: 8, squadIndex: 3 },
    ]);
    rerender(modelOf(afterSwap, { interactionActive: true, strip: "undo" }));
    expect(shown()).toEqual(["maja", "b", "c"]);

    // Undo window over.
    rerender(modelOf(afterSwap));
    expect(shown()).toEqual(["b", "c", "maja"]);
  });

  it("holds the order while a finger is on the bench and re-sorts after release", async () => {
    const bench = benchOf([{ playerId: "a", minutes: 0 }, { playerId: "b", minutes: 4 }]);
    const { rerender } = renderBench(modelOf(bench));
    fireEvent.pointerDown(rail());
    rerender(modelOf(benchOf([{ playerId: "a", minutes: 9 }, { playerId: "b", minutes: 4 }])));
    expect(shown()).toEqual(["a", "b"]);

    act(() => {
      window.dispatchEvent(new Event("pointerup"));
    });
    expect(shown()).toEqual(["a", "b"]);
    await waitFor(() => expect(shown()).toEqual(["b", "a"]));
  });

  it("holds the order while the rail scrolls and re-sorts once it settles", async () => {
    const bench = benchOf([{ playerId: "a", minutes: 0 }, { playerId: "b", minutes: 4 }]);
    const { rerender } = renderBench(modelOf(bench));
    fireEvent.scroll(rail());
    rerender(modelOf(benchOf([{ playerId: "a", minutes: 9 }, { playerId: "b", minutes: 4 }])));
    expect(shown()).toEqual(["a", "b"]);
    await waitFor(() => expect(shown()).toEqual(["b", "a"]));
  });

  it("returns the rail to the start after a substitution, only once the hold ends", () => {
    overflowing = true;
    const bench = benchOf(Array.from({ length: 11 }, (_, i) => ({ playerId: `b${i + 1}`, minutes: i })));
    const { rerender } = renderBench(modelOf(bench));
    scrollLeft = 120;

    const swapped = bench.map((tile) => (tile.playerId === "b11" ? { ...tile, playerId: "out", minutes: 3 } : tile));
    rerender(modelOf(swapped, { interactionActive: true, strip: "undo" }));
    expect(scrollLeft).toBe(120);
    expect(shown().at(-1)).toBe("out");

    rerender(modelOf(swapped));
    expect(scrollLeft).toBe(0);
    // 3′ ties with b4 (3′), which is earlier in the squad.
    expect(shown().indexOf("out")).toBe(4);
  });

  it("asks for the direction lock only when the bench overflows", () => {
    overflowing = true;
    const { props } = renderBench(
      modelOf(benchOf(Array.from({ length: 11 }, (_, i) => ({ playerId: `b${i + 1}`, minutes: 0 }))))
    );
    fireEvent.pointerDown(rail().querySelector('[data-bench-player-id="b7"]')!);
    expect(props.onBenchPointerDown).toHaveBeenCalledWith("b7", expect.anything(), { directionLock: true });
  });
});

describe("Bench rail controls", () => {
  it("shows no jump buttons when everyone fits", async () => {
    renderBench(modelOf(benchOf(Array.from({ length: 5 }, (_, i) => ({ playerId: `b${i + 1}`, minutes: 0 })))));
    await act(async () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    expect(screen.queryByTestId("bench-jump-end")).toBeNull();
    expect(screen.queryByTestId("bench-jump-start")).toBeNull();
  });

  it("'+N' counts the hidden substitutes and jumps to the end; '‹ N' jumps back", async () => {
    overflowing = true;
    renderBench(modelOf(benchOf(Array.from({ length: 15 }, (_, i) => ({ playerId: `b${i + 1}`, minutes: i })))));

    // Columns end at 86, 176, 266, 356, …; past 332 (360 − fade) is hidden: 9 tiles.
    const end = await screen.findByTestId("bench-jump-end");
    expect(end.textContent).toBe("+9");
    expect(end.getAttribute("aria-label")).toBe("Vis 9 innbyttere til, med flest minutter");
    expect(screen.queryByTestId("bench-jump-start")).toBeNull();

    fireEvent.click(end);
    expect(scrollLeft).toBe(maxScroll(15));
    const start = await screen.findByTestId("bench-jump-start");
    await waitFor(() => expect(screen.queryByTestId("bench-jump-end")).toBeNull());
    // Scrolled 360px: columns 0–4 start left of the 28px fade (column 4 at 0).
    expect(start.textContent).toBe("10");
    expect(start.getAttribute("aria-label")).toBe("Tilbake til de med minst spilletid");

    fireEvent.click(start);
    expect(scrollLeft).toBe(0);
    await screen.findByTestId("bench-jump-end");
  });

  it("shows the cues under StrictMode (effects mount, unmount and mount again in development)", async () => {
    overflowing = true;
    render(
      <StrictMode>
        <NextIntlClientProvider locale="no" messages={no}>
          <Bench
            model={modelOf(benchOf(Array.from({ length: 11 }, (_, i) => ({ playerId: `b${i + 1}`, minutes: i }))))}
            disabled={false}
            flashedPlayerId={null}
            onTapBenchPlayer={vi.fn()}
            onBenchPointerDown={vi.fn()}
          />
        </NextIntlClientProvider>
      </StrictMode>
    );
    expect((await screen.findByTestId("bench-jump-end")).textContent).toBe("+5");
  });

  it("works from the keyboard: the jump buttons are real buttons", async () => {
    overflowing = true;
    renderBench(modelOf(benchOf(Array.from({ length: 9 }, (_, i) => ({ playerId: `b${i + 1}`, minutes: i })))));
    const end = await screen.findByTestId("bench-jump-end");
    expect(end.tagName).toBe("BUTTON");
    expect(end.getAttribute("type")).toBe("button");
    end.focus();
    expect(document.activeElement).toBe(end);
  });
});

describe("Bench names", () => {
  it("shows long and duplicate names in full, and keeps their minutes", () => {
    renderBench(
      modelOf(
        benchOf([
          { playerId: "p1", minutes: 0, name: "Anne-Kathrine L" },
          { playerId: "p2", minutes: 0, name: "Thea S2" },
          { playerId: "p3", minutes: 12, name: "Thea S" },
          { playerId: "p4", minutes: 4, name: "Marie-Louise B", number: "9" },
        ])
      )
    );
    const tile = (id: string) => rail().querySelector<HTMLElement>(`[data-bench-player-id="${id}"]`)!;
    expect(tile("p1").textContent).toBe("Anne-Kathrine L0′");
    expect(tile("p2").textContent).toBe("Thea S20′");
    expect(tile("p3").textContent).toBe("Thea S12′");
    expect(tile("p4").getAttribute("aria-label")).toBe("Marie-Louise B, nummer 9, 4 minutter totalt");
    expect(shown()).toEqual(["p1", "p2", "p4", "p3"]);
  });
});
