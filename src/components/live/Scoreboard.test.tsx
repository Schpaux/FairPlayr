import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Scoreboard } from "@/components/live/Scoreboard";
import { MenuSheet } from "@/components/live/LiveSheets";
import type { LiveScreenModel } from "@/components/live/liveScreenModel";
import no from "../../../messages/no.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const MODEL = {
  status: "running",
  phase: "first_half",
  halves: 2,
  halfMinutes: 20,
  clock: "12:30",
  inStoppage: false,
  teamScore: 1,
  opponentScore: 0,
} as unknown as LiveScreenModel;

function renderBoard(props: { isOnline?: boolean; saveFailed?: boolean } = {}) {
  return render(
    <NextIntlClientProvider locale="no" messages={no}>
      <Scoreboard
        model={MODEL}
        isOnline={props.isOnline ?? true}
        saveFailed={props.saveFailed}
        menuOpen={false}
        onClockPress={() => undefined}
        onGoalUs={() => undefined}
        onGoalThem={() => undefined}
        onOpenMenu={() => undefined}
      />
    </NextIntlClientProvider>
  );
}

function renderMenu(props: { isOnline?: boolean; saveFailed?: boolean; notes?: Parameters<typeof MenuSheet>[0]["notes"] }) {
  return render(
    <NextIntlClientProvider locale="no" messages={no}>
      <MenuSheet
        isOnline={props.isOnline ?? true}
        saveFailed={props.saveFailed}
        notes={props.notes}
        canEndHalf={false}
        canRemoveGoalUs={false}
        canRemoveGoalThem={false}
        canEndMatch
        onClose={() => undefined}
        onEvents={() => undefined}
        onEndHalf={() => undefined}
        onRemoveGoalUs={() => undefined}
        onRemoveGoalThem={() => undefined}
        onEndMatch={() => undefined}
      />
    </NextIntlClientProvider>
  );
}

describe("Scoreboard meta line: «Ikke lagret» (DESIGN.md §5.6)", () => {
  afterEach(cleanup);

  it("by default shows the phase and the status dot, as today", () => {
    renderBoard();
    const meta = screen.getByTestId("live-meta");
    expect(meta.textContent).not.toContain(no.restore.storageError.short);
    expect(meta.textContent).toContain("1. omgang");
  });

  it("shows a glyph plus the words, and says it in the clock key's label", () => {
    renderBoard({ saveFailed: true });
    const meta = screen.getByTestId("live-meta");
    expect(meta.textContent).toBe(no.restore.storageError.short);
    expect(meta.querySelector("svg")).not.toBeNull();
    expect(screen.getByTestId("live-clock").getAttribute("aria-label")).toContain(no.restore.storageError.short);
  });

  it("takes priority over the offline glyph", () => {
    renderBoard({ saveFailed: true, isOnline: false });
    expect(screen.queryByRole("img", { name: no.matchLive.sideline.meta.offline })).toBeNull();
    expect(screen.getByTestId("live-meta").textContent).toBe(no.restore.storageError.short);
  });

  it("offline without a storage problem keeps the offline glyph", () => {
    renderBoard({ isOnline: false });
    expect(screen.getByRole("img", { name: no.matchLive.sideline.meta.offline })).toBeTruthy();
  });
});

describe("Menu rows for persistent and passive conditions", () => {
  afterEach(cleanup);

  it("the storage explanation is the first row, before the offline note", () => {
    renderMenu({ saveFailed: true, isOnline: false });
    const notes = screen.getByTestId("live-menu").querySelectorAll("p");
    expect(notes[0].getAttribute("data-testid")).toBe("live-menu-save-failed");
    expect(notes[0].textContent).toContain(no.restore.storageError.title);
    expect(notes[0].textContent).toContain(no.restore.storageError.body);
    expect(notes[1].textContent).toContain(no.matchLive.sideline.menu.offline);
  });

  it("shows passive notes (restored match, team warning) and nothing extra by default", () => {
    const { unmount } = renderMenu({});
    expect(screen.getByTestId("live-menu").querySelectorAll("p")).toHaveLength(0);
    unmount();

    renderMenu({
      notes: [
        { key: "workspaceError", tone: "warning", text: no.restore.workspaceError.title },
        { key: "restoredMatch", tone: "info", text: "Appen var lukket i 7 min" },
      ],
    });
    expect(screen.getByTestId("live-menu-note-workspaceError").textContent).toContain(no.restore.workspaceError.title);
    expect(screen.getByTestId("live-menu-note-restoredMatch").textContent).toContain("7 min");
    fireEvent.keyDown(window, { key: "Escape" });
  });
});
