import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FormatSelector } from "@/components/match/FormatSelector";
import { FormationSelector } from "@/components/match/FormationSelector";
import { DurationPicker } from "@/components/match/DurationPicker";
import { MatchDefaultsEditor } from "@/components/team/MatchDefaultsEditor";
import { renderWithIntl } from "@/components/ui/primitives/testUtils";
import { getFormationPresets, type MatchDurationConfig } from "@/domain/match";
import no from "../../../messages/no.json";
import en from "../../../messages/en.json";

// C1-F3 / B5: a selected choice chip shows a check mark as well as the lime
// fill, keeps its aria-pressed state, and the glyph never joins the name.

const checks = (button: HTMLElement) => within(button).queryAllByTestId("selected-check");

function expectOnlySelectedChecked(buttons: HTMLElement[], selectedName: string) {
  const selected = buttons.filter((button) => button.getAttribute("aria-pressed") === "true");
  expect(selected).toHaveLength(1);
  expect(selected[0].textContent).toContain(selectedName);
  for (const button of buttons) {
    const isSelected = button === selected[0];
    expect(checks(button)).toHaveLength(isSelected ? 1 : 0);
  }
  const glyph = checks(selected[0])[0];
  expect(glyph.getAttribute("aria-hidden")).toBe("true");
  // Positioned beside the label, so the chip is the same size in both states.
  expect(glyph.getAttribute("class")).toContain("absolute");
}

describe("choice chips show a check on the selected option (C1-F3)", () => {
  afterEach(cleanup);

  it("FormatSelector", () => {
    const onChange = vi.fn();
    renderWithIntl(<FormatSelector value="7v7" onChange={onChange} />);
    const buttons = screen.getAllByRole("button");
    expectOnlySelectedChecked(buttons, "7v7");
    // The accessible name is unchanged by the glyph.
    expect(screen.getByRole("button", { name: /^7v7\s?7 på banen$/, pressed: true })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^5v5/ }));
    expect(onChange).toHaveBeenCalledWith("5v5");
  });

  it("FormatSelector in the /lineup namespace", () => {
    renderWithIntl(<FormatSelector value="9v9" onChange={() => {}} i18nNamespace="lineup.format" />, "en");
    expectOnlySelectedChecked(screen.getAllByRole("button"), "9v9");
  });

  it("FormationSelector", () => {
    const formations = getFormationPresets("7v7");
    const onChange = vi.fn();
    renderWithIntl(<FormationSelector formations={formations} value={formations[1].id} onChange={onChange} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(formations.length);
    expectOnlySelectedChecked(buttons, formations[1].shape);
    expect(
      screen.getByRole("button", { name: formations[1].shape, pressed: true })
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: formations[0].shape }));
    expect(onChange).toHaveBeenCalledWith(formations[0].id);
  });

  it("DurationPicker: the halves toggle and the preset", () => {
    const value: MatchDurationConfig = {
      mode: "preset",
      presetId: "2x20",
      halves: 2,
      minutesPerHalf: 20,
      totalMinutes: 40,
    };
    renderWithIntl(
      <DurationPicker value={value} onPresetChange={() => {}} onCustomChange={() => {}} onHalvesChange={() => {}} />
    );
    const halvesOn = screen.getByRole("button", { name: no.matchSetup.duration.halvesOn });
    const halvesOff = screen.getByRole("button", { name: no.matchSetup.duration.halvesOff });
    expect(halvesOn.getAttribute("aria-pressed")).toBe("true");
    expect(checks(halvesOn)).toHaveLength(1);
    expect(checks(halvesOff)).toHaveLength(0);

    const presets = screen.getAllByRole("button", { name: /^2x\d+$/ });
    expectOnlySelectedChecked(presets, "2x20");
  });

  it("DurationPicker: a custom duration selects no preset and shows no preset check", () => {
    const value: MatchDurationConfig = {
      mode: "custom",
      presetId: null,
      halves: 1,
      minutesPerHalf: 45,
      totalMinutes: 45,
    };
    renderWithIntl(
      <DurationPicker value={value} onPresetChange={() => {}} onCustomChange={() => {}} onHalvesChange={() => {}} />
    );
    const presets = screen.getAllByRole("button", { name: /^1x\d+$/ });
    for (const preset of presets) {
      expect(preset.getAttribute("aria-pressed")).toBe("false");
      expect(checks(preset)).toHaveLength(0);
    }
    expect(checks(screen.getByRole("button", { name: no.matchSetup.duration.halvesOff }))).toHaveLength(1);
  });
});

describe("MatchDefaultsEditor (team defaults)", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it("shows the check on the selected format, formation and duration", () => {
    renderWithIntl(<MatchDefaultsEditor teamId="team-1" />);
    const pressed = screen.getAllByRole("button", { pressed: true });
    // Format, formation and duration: one selected chip each, each with one check.
    expect(pressed).toHaveLength(3);
    for (const button of pressed) expect(checks(button)).toHaveLength(1);
    expect(screen.getAllByTestId("selected-check")).toHaveLength(3);

    const duration = screen.getByRole("button", { name: "2x15 (30 min)" });
    fireEvent.click(duration);
    expect(duration.getAttribute("aria-pressed")).toBe("true");
    expect(checks(duration)).toHaveLength(1);
    expect(screen.getAllByTestId("selected-check")).toHaveLength(3);
  });

  it("keeps all text at 13px or more and translates the minutes (C3-F3)", () => {
    const { container } = renderWithIntl(<MatchDefaultsEditor teamId="team-1" />, "en");
    expect(container.innerHTML).not.toMatch(/text-\[1[0-2]px\]|text-xs/);
    expect(screen.getByRole("button", { name: "2x20 (40 min)" })).toBeTruthy();
    expect(screen.getByText(en.team.matchDefaults.title)).toBeTruthy();
  });

  it("has the new keys in both languages", () => {
    expect(no.team.matchDefaults.durationTotal).toContain("{minutes}");
    expect(en.team.matchDefaults.durationTotal).toContain("{minutes}");
  });
});
