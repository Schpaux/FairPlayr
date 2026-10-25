import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PitchLineupEditor } from "@/components/match/PitchLineupEditor";
import { placeTokens } from "@/components/live/placeTokens";
import {
  autoFillLineup,
  createMatchSetupWithPrefs,
  getFormationSlots,
  selectAllSquad,
  type MatchSetup,
} from "@/domain/match";
import type { Player } from "@/domain/team";
import no from "../../../messages/no.json";
import en from "../../../messages/en.json";

// FP-PITCH-01: the setup pitch is the live pitch. Tokens sit where
// `placeTokens` puts them on Live (own goal at the bottom, keeper lowest),
// the shared markings are drawn, and tap-to-place still edits the lineup.

// The primitives' ButtonLink imports the locale-aware Link; this editor never renders one.
vi.mock("@/i18n/navigation", () => ({ Link: () => null }));

const NOW = "2026-10-14T10:00:00.000Z";
const players: Player[] = ["Frida", "Ida", "Selma", "Vilde", "Maja", "Nora", "Emma", "Thea", "Ingrid"].map(
  (name, index) => ({
    id: `p${index + 1}`,
    name,
    number: index === 8 ? undefined : index + 1,
    source: "manual",
    externalProvider: null,
    externalId: null,
    isManaged: false,
    createdAt: NOW,
    updatedAt: NOW,
  })
);

function setupOf({ filled }: { filled: boolean }): MatchSetup {
  const base = selectAllSquad(
    createMatchSetupWithPrefs("team", { format: "7v7", formationId: "7v7-2-3-1" }),
    players.map((player) => player.id)
  );
  return filled ? autoFillLineup(base) : base;
}

function Harness({
  initial,
  onChange,
  locale = "no",
}: {
  initial: MatchSetup;
  onChange?: (setup: MatchSetup) => void;
  locale?: "no" | "en";
}) {
  const [setup, setSetup] = useState(initial);
  return (
    <NextIntlClientProvider locale={locale} messages={locale === "no" ? no : en}>
      <PitchLineupEditor
        setup={setup}
        players={players}
        onSetupChange={(next) => {
          onChange?.(next);
          setSetup(next);
        }}
        onAutoFill={() => setSetup(autoFillLineup)}
      />
    </NextIntlClientProvider>
  );
}

const slot = (id: string) => document.querySelector<HTMLElement>(`[data-slot-id="${id}"]`)!;

beforeEach(() => {
  // jsdom has no layout; give the pitch a phone-sized box so the markings draw.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const sized = this.dataset.testid === "setup-pitch";
    return { x: 0, y: 0, left: 0, top: 0, width: sized ? 343 : 0, height: sized ? 429 : 0, right: 0, bottom: 0, toJSON: () => ({}) } as DOMRect;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PitchLineupEditor pitch (FP-PITCH-01)", () => {
  it("places every token where the live pitch does, keeper at our goal", () => {
    const setup = setupOf({ filled: true });
    render(<Harness initial={setup} />);

    const slots = getFormationSlots(setup.format, setup.formationId);
    const placements = placeTokens(slots);
    for (const { id } of slots) {
      expect(slot(id).style.left).toBe(`${placements[id].x}%`);
      expect(slot(id).style.top).toBe(`${placements[id].y}%`);
      expect(slot(id).dataset.playerId).toBe(setup.slotAssignments[id]);
    }
    expect(slot("7v7-1").style.top).toBe("100%");
  });

  it("draws the shared live markings and the live token, without minutes", () => {
    render(<Harness initial={setupOf({ filled: true })} />);

    const pitch = screen.getByTestId("setup-pitch");
    expect(pitch.querySelector("svg[data-pitch-markings]")).not.toBeNull();
    expect(pitch.querySelector("[data-token-box]")).not.toBeNull();

    const keeper = slot("7v7-1");
    expect(keeper.getAttribute("aria-label")).toBe("Frida, nummer 1, keeper");
    expect(keeper.textContent).toBe("1KFrida");
    expect(keeper.textContent).not.toMatch(/′/);
  });

  it("shows initials for a player without a number and labels open positions", () => {
    const setup = setupOf({ filled: false });
    render(<Harness initial={setup} />);

    expect(slot("7v7-3").getAttribute("aria-label")).toBe("Ledig plass 3");
    expect(slot("7v7-3").dataset.playerId).toBeUndefined();

    fireEvent.click(screen.getByRole("button", { name: "Ingrid" }));
    fireEvent.click(slot("7v7-3"));
    expect(slot("7v7-3").dataset.playerId).toBe("p9");
    expect(slot("7v7-3").textContent).toBe("IIngrid");
  });

  it("taps a bench player onto a position and swaps two positions by tapping", () => {
    const setup = setupOf({ filled: true });
    const changes: MatchSetup[] = [];
    render(<Harness initial={setup} onChange={(next) => changes.push(next)} />);
    const before = { ...setup.slotAssignments };

    fireEvent.click(screen.getByRole("button", { name: "Thea" }));
    fireEvent.click(slot("7v7-3"));
    expect(changes.at(-1)!.slotAssignments["7v7-3"]).toBe("p8");
    expect(changes.at(-1)!.startingPlayerIds).not.toContain(before["7v7-3"]);

    fireEvent.click(slot("7v7-2"));
    fireEvent.click(slot("7v7-4"));
    expect(changes.at(-1)!.slotAssignments["7v7-2"]).toBe(before["7v7-4"]);
    expect(changes.at(-1)!.slotAssignments["7v7-4"]).toBe(before["7v7-2"]);
  });
});

// UI-PITCH-02: the same interactions, with every word from messages/*.json
// and the bench in the live tile style.
describe("PitchLineupEditor copy and bench (UI-PITCH-02)", () => {
  // The counter is for screen readers here; the sticky bar shows it (C1-F1).
  it("shows the counter, auto-fill and bench through i18n (Norwegian)", () => {
    render(<Harness initial={setupOf({ filled: false })} />);

    expect(screen.getByText(/^0 \/ 7 på banen/)).toBeTruthy();
    expect(screen.getByText(no.matchSetup.pitch.hintIdle)).toBeTruthy();
    expect(screen.getByText(no.matchSetup.pitch.benchTitle)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: no.matchSetup.pitch.autoFill }));

    expect(screen.getByText(/^7 \/ 7 på banen/)).toBeTruthy();
    expect(document.querySelectorAll("[data-slot-id][data-player-id]")).toHaveLength(7);
  });

  it("has no hard-coded Norwegian in English", () => {
    render(<Harness initial={setupOf({ filled: true })} locale="en" />);

    expect(screen.getByRole("button", { name: en.matchSetup.pitch.autoFill })).toBeTruthy();
    expect(screen.getByText(/^7 \/ 7 on the pitch/)).toBeTruthy();
    expect(screen.getByText(en.matchSetup.pitch.benchTitle)).toBeTruthy();
    for (const word of ["Fyll automatisk", "startere", "Benk", "valgt"]) {
      expect(document.body.textContent).not.toContain(word);
    }
  });

  it("marks the selected bench tile as pressed and says what to tap next", () => {
    render(<Harness initial={setupOf({ filled: true })} />);
    const thea = screen.getByRole("button", { name: "Thea" });
    expect(thea.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(thea);

    expect(thea.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Thea valgt – trykk en plass på banen")).toBeTruthy();

    fireEvent.click(thea);
    expect(thea.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText(no.matchSetup.pitch.hintIdle)).toBeTruthy();
  });

  it("says when nobody is on the bench", () => {
    const base = selectAllSquad(
      createMatchSetupWithPrefs("team", { format: "7v7", formationId: "7v7-2-3-1" }),
      players.slice(0, 7).map((player) => player.id)
    );
    render(<Harness initial={autoFillLineup(base)} />);

    expect(screen.getByText(no.matchSetup.pitch.benchEmpty)).toBeTruthy();
  });
});
