import { cleanup, fireEvent, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SquadSelector } from "@/components/match/SquadSelector";
import { renderWithIntl } from "@/components/ui/primitives/testUtils";
import type { Player } from "@/domain/team";
import no from "../../../messages/no.json";
import en from "../../../messages/en.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

function player(id: string, name: string, number?: number): Player {
  return {
    id,
    name,
    number,
    source: "manual",
    externalProvider: null,
    externalId: null,
    isManaged: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const PLAYERS = [player("p1", "Ida", 7), player("p2", "Nora")];

function renderSelector(selectedIds: string[], locale: "no" | "en" = "no") {
  const onToggle = vi.fn();
  renderWithIntl(
    <>
      <h2 id="squad-heading">Hvem er med i dag?</h2>
      <SquadSelector
        players={PLAYERS}
        selectedIds={selectedIds}
        onToggle={onToggle}
        onSelectAll={() => {}}
        onClearSelection={() => {}}
        selectAllLabel="Velg alle"
        clearLabel="Tøm"
        labelledBy="squad-heading"
      />
    </>,
    locale
  );
  return { onToggle };
}

// C1-F6: «Borte» is in the accessible name of an absent player, not only on screen.
describe("SquadSelector accessible names", () => {
  afterEach(cleanup);

  it("names a present player by name and an absent one with «borte»", () => {
    const { onToggle } = renderSelector(["p1"]);
    const list = screen.getByRole("list", { name: "Hvem er med i dag?" });
    expect(list).toBeTruthy();

    const present = screen.getByRole("button", { name: "Ida" });
    expect(present.getAttribute("aria-pressed")).toBe("true");

    const absent = screen.getByRole("button", { name: "Nora, borte" });
    expect(absent.getAttribute("aria-pressed")).toBe("false");
    // Still shown in words on screen.
    expect(absent.textContent).toContain(no.matchSetup.squad.absent);

    fireEvent.click(absent);
    expect(onToggle).toHaveBeenCalledWith("p2");
  });

  it("uses the English wording in English", () => {
    renderSelector([], "en");
    expect(screen.getByRole("button", { name: "Ida, away" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nora, away" })).toBeTruthy();
    expect(en.matchSetup.squad.absentName).toBe("{name}, away");
  });
});
