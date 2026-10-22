import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { PlayerQuickAddForm } from "@/components/team/PlayerQuickAddForm";
import no from "../../../messages/no.json";
import en from "../../../messages/en.json";

function renderForm(onAddPlayer = vi.fn(() => true)) {
  render(
    <PlayerQuickAddForm
      label={no.team.forms.playerNameLabel}
      placeholder={no.team.forms.playerNamePlaceholder}
      submitLabel={no.team.actions.addPlayer}
      validationMessage={no.team.validation.playerNameRequired}
      duplicateMessage={no.team.validation.playerNameDuplicate}
      onAddPlayer={onAddPlayer}
    />
  );
  return { onAddPlayer };
}

// C3-F2: the field has a visible label, so it keeps its name while typing,
// and a short placeholder that fits at 360px.
describe("PlayerQuickAddForm", () => {
  afterEach(cleanup);

  it("has a visible label associated with the input", () => {
    renderForm();
    const input = screen.getByLabelText(no.team.forms.playerNameLabel) as HTMLInputElement;
    const label = screen.getByText(no.team.forms.playerNameLabel);
    expect(label.tagName).toBe("LABEL");
    expect(label.getAttribute("for")).toBe(input.id);
    expect(label.className).not.toContain("sr-only");
    expect(label.className).toContain("text-[13px]");

    fireEvent.change(input, { target: { value: "Ida" } });
    // The name stays after the placeholder is gone.
    expect(screen.getByLabelText(no.team.forms.playerNameLabel)).toBe(input);
  });

  it("uses a short placeholder in both languages", () => {
    renderForm();
    expect(screen.getByPlaceholderText(no.team.forms.playerNamePlaceholder)).toBeTruthy();
    expect(no.team.forms.playerNamePlaceholder.length).toBeLessThanOrEqual(12);
    expect(en.team.forms.playerNamePlaceholder.length).toBeLessThanOrEqual(12);
  });

  it("still adds a player", async () => {
    const { onAddPlayer } = renderForm();
    const input = screen.getByLabelText(no.team.forms.playerNameLabel) as HTMLInputElement;
    fireEvent.change(input, { target: { value: " Ida " } });
    fireEvent.click(screen.getByRole("button", { name: no.team.actions.addPlayer }));
    await waitFor(() => expect(onAddPlayer).toHaveBeenCalledWith("Ida"));
    await waitFor(() => expect(input.value).toBe(""));
  });
});
