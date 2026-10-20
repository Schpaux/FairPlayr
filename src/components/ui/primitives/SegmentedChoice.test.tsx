import { useState } from "react";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SegmentedChoice } from "./SegmentedChoice";
import { renderWithIntl } from "./testUtils";

afterEach(cleanup);

const FORMATS = [
  { value: "5v5", label: "5v5" },
  { value: "7v7", label: "7v7" },
  { value: "9v9", label: "9v9", disabled: true },
] as const;

type Format = (typeof FORMATS)[number]["value"];

function Harness({ onChange }: { onChange?: (value: Format) => void }) {
  const [value, setValue] = useState<Format>("7v7");
  return (
    <SegmentedChoice
      label="Kampformat"
      options={FORMATS}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

describe("SegmentedChoice", () => {
  it("is a radio group named by its legend with the current value checked", () => {
    renderWithIntl(<Harness />);
    expect(screen.getByRole("group", { name: "Kampformat" })).toBeTruthy();
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios.map((radio) => radio.checked)).toEqual([false, true, false]);
    expect(radios[0].name).toBe(radios[1].name);
  });

  it("changes the value when an option is chosen", () => {
    const onChange = vi.fn();
    renderWithIntl(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "5v5" }));
    expect(onChange).toHaveBeenCalledWith("5v5");
    expect((screen.getByRole("radio", { name: "5v5" }) as HTMLInputElement).checked).toBe(true);
  });

  it("disables single options and the whole group", () => {
    const { rerender } = renderWithIntl(<Harness />);
    expect((screen.getByRole("radio", { name: "9v9" }) as HTMLInputElement).disabled).toBe(true);

    rerender(
      <SegmentedChoice label="Kampformat" options={FORMATS} value="7v7" onValueChange={() => undefined} disabled />,
    );
    expect((screen.getByRole("group", { name: "Kampformat" }) as HTMLFieldSetElement).disabled).toBe(true);
  });

  it("keeps the label for screen readers when it is visually hidden", () => {
    renderWithIntl(
      <SegmentedChoice label="Tema" hideLabel options={FORMATS} value="5v5" onValueChange={() => undefined} />,
    );
    expect(screen.getByRole("group", { name: "Tema" })).toBeTruthy();
  });
});
