import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventTimeline, type TimelineEntry } from "@/components/match/EventTimeline";
import en from "../../../messages/en.json";
import no from "../../../messages/no.json";

vi.mock("@/i18n/navigation", () => ({ Link: () => null }));

const LONG = "Kristiane-Marie Johannessen-Bakkebø";
const ENTRIES: TimelineEntry[] = [
  { id: "g1", minute: 4, side: "own", kind: "goal", primary: LONG, secondary: "Ida" },
  { id: "s1", minute: 10, side: "own", kind: "substitution", primary: "Thea", secondary: "Maja" },
  { id: "g2", minute: 12, side: "opponent", kind: "goal", primary: null, secondary: null },
  { id: "g3", minute: null, side: "own", kind: "goal", primary: null, secondary: null },
];

function renderTimeline(props: Partial<React.ComponentProps<typeof EventTimeline>> = {}, locale: "no" | "en" = "no") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "no" ? no : en}>
      <EventTimeline entries={ENTRIES} opponentName="Skeid" label="Hendelser" {...props} />
    </NextIntlClientProvider>
  );
}

afterEach(cleanup);

describe("EventTimeline (UI-EVENTS-01)", () => {
  it("puts our events left and the opponent's right, each with one spoken sentence", () => {
    renderTimeline();
    const items = within(screen.getByRole("list", { name: "Hendelser" })).getAllByRole("listitem");
    expect(items.map((item) => item.dataset.side)).toEqual(["own", "own", "opponent", "own"]);
    expect(items.map((item) => item.querySelector(".sr-only")?.textContent)).toEqual([
      `4. minutt, mål for oss: ${LONG}, assist Ida`,
      "10. minutt, bytte: Thea inn, Maja ut",
      "12. minutt, mål for Skeid",
      "mål for oss, målscorer ikke registrert",
    ]);
  });

  it("shows the scorer bold with the assist on the same line, never truncated", () => {
    renderTimeline();
    const goal = screen.getAllByRole("listitem")[0];
    expect(goal.querySelector("strong")?.textContent).toBe(LONG);
    expect(goal.textContent).toContain(`${LONG} · assist Ida`);
    expect(goal.innerHTML).not.toMatch(/truncate|ellipsis|nowrap/);
    // Substitutions are regular weight; an unknown scorer still says «Mål».
    expect(screen.getAllByRole("listitem")[1].querySelector("strong")).toBeNull();
    expect(screen.getAllByRole("listitem")[3].querySelector("strong")?.textContent).toBe("Mål");
  });

  it("makes only the rows the caller allows into edit buttons", () => {
    const onEdit = vi.fn();
    renderTimeline({ canEdit: (entry) => entry.id === "g1", onEdit, editLabel: "Rediger mål" });
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute("aria-label")).toBe(`4. minutt, mål for oss: ${LONG}, assist Ida. Rediger mål`);
    fireEvent.click(buttons[0]);
    expect(onEdit).toHaveBeenCalledWith(ENTRIES[0]);
  });

  it("speaks English in English", () => {
    renderTimeline({ label: "Events" }, "en");
    const items = screen.getAllByRole("listitem");
    expect(items[1].querySelector(".sr-only")?.textContent).toBe("Minute 10, substitution: Thea on, Maja off");
    expect(items[2].textContent).toContain("Goal · Skeid");
  });
});
