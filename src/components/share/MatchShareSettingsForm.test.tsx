// FEAT-SHARE-04: «Vis lagoppstilling og benk» is an option under «Del live»:
// off by default, only offered while «Del live» is on, and turned off with it.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MatchShareSettingsForm } from "@/components/share/MatchShareSettingsForm";
import { DEFAULT_SHARE_SETTINGS, type MatchShareSettings } from "@/domain/matchShare";
import no from "../../../messages/no.json";

vi.mock("@/i18n/navigation", () => ({ getPathname: ({ href }: { href: string }) => href }));

function renderForm(settings: MatchShareSettings, onChange = vi.fn()) {
  render(
    <NextIntlClientProvider locale="no" messages={no}>
      <MatchShareSettingsForm settings={settings} onChange={onChange} token={null} linkStatus="pending" />
    </NextIntlClientProvider>
  );
  return onChange;
}

describe("MatchShareSettingsForm lineup option", () => {
  afterEach(cleanup);

  it("is not offered while «Del live» is off", () => {
    renderForm({ ...DEFAULT_SHARE_SETTINGS, summary: true });
    expect(screen.queryByTestId("match-share-lineup")).toBeNull();
  });

  it("is offered off under «Del live», and turns on by itself", () => {
    const onChange = renderForm({ ...DEFAULT_SHARE_SETTINGS, live: true });
    const toggle = screen.getByTestId("match-share-lineup");
    expect(toggle.textContent).toContain(no.matchShare.lineupToggle);
    expect(toggle.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ live: true, lineup: true }));
  });

  it("turning «Del live» off turns the lineup off too", () => {
    const onChange = renderForm({ ...DEFAULT_SHARE_SETTINGS, live: true, summary: true, lineup: true });
    fireEvent.click(screen.getByRole("switch", { name: no.matchShare.liveToggle }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ live: false, summary: true, lineup: false }));
  });
});
