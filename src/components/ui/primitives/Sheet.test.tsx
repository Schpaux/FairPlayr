import { useRef, useState } from "react";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmSheet, Sheet } from "./Sheet";
import { renderWithIntl } from "./testUtils";

vi.mock("@/i18n/navigation", () => ({ Link: () => null }));

afterEach(cleanup);

function SheetHarness({ dismissible = true }: { dismissible?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Åpne
      </button>
      <button type="button">Bak arket</button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Kampinnstillinger"
        description="Endringene gjelder fra neste kamp."
        dismissible={dismissible}
        testId="sheet"
      >
        <button type="button">Første valg</button>
        <button type="button">Andre valg</button>
      </Sheet>
    </>
  );
}

async function openSheet() {
  const trigger = screen.getByRole("button", { name: "Åpne" });
  trigger.focus();
  fireEvent.click(trigger);
  return screen.findByRole("dialog");
}

describe("Sheet", () => {
  it("is a labelled, described modal dialog that focuses its title", async () => {
    renderWithIntl(<SheetHarness />);
    const dialog = await openSheet();

    expect(dialog.getAttribute("aria-labelledby")).toBe(screen.getByRole("heading", { name: "Kampinnstillinger" }).id);
    const describedBy = dialog.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(describedBy)?.textContent).toBe("Endringene gjelder fra neste kamp.");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Kampinnstillinger" })));
  });

  it("renders a localised close button by default", async () => {
    renderWithIntl(<SheetHarness />);
    await openSheet();
    expect(screen.getByRole("button", { name: "Lukk" })).toBeTruthy();
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    renderWithIntl(<SheetHarness />);
    const dialog = await openSheet();
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    fireEvent.keyDown(document.activeElement ?? dialog, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Åpne" })));
  });

  it("closes from the close button and returns focus", async () => {
    renderWithIntl(<SheetHarness />);
    await openSheet();
    fireEvent.click(screen.getByRole("button", { name: "Lukk" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Åpne" })));
  });

  it("ignores Escape when not dismissible", async () => {
    renderWithIntl(<SheetHarness dismissible={false} />);
    const dialog = await openSheet();
    fireEvent.keyDown(document.activeElement ?? dialog, { key: "Escape" });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("makes the page behind inert while open", async () => {
    renderWithIntl(<SheetHarness />);
    await openSheet();
    // Outside content is hidden from assistive tech while the modal is open.
    expect(screen.queryByRole("button", { name: "Bak arket" })).toBeNull();
    expect(screen.getByRole("button", { name: "Bak arket", hidden: true })).toBeTruthy();
  });

  it("warns in development when a non-dismissible sheet has no way out", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    renderWithIntl(<Sheet open onOpenChange={() => undefined} title="Felle" dismissible={false} closeButton={false} />);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("non-dismissible"));
    error.mockRestore();
  });

  it("honours initialFocus", async () => {
    function Harness() {
      const ref = useRef<HTMLButtonElement>(null);
      return (
        <Sheet open onOpenChange={() => undefined} title="Tittel" initialFocus={ref} closeButton={false}>
          <button type="button" ref={ref}>
            Mål
          </button>
        </Sheet>
      );
    }
    renderWithIntl(<Harness />);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Mål" })));
  });
});

describe("ConfirmSheet", () => {
  function ConfirmHarness({ onConfirm, destructive }: { onConfirm: () => void; destructive?: boolean }) {
    const [open, setOpen] = useState(true);
    return (
      <ConfirmSheet
        open={open}
        onOpenChange={setOpen}
        title="Avslutte kampen nå?"
        description="Stillingen er 2–1 etter 38 minutter."
        confirmLabel="Ja, avslutt kampen"
        destructive={destructive}
        onConfirm={() => {
          onConfirm();
          setOpen(false);
        }}
      />
    );
  }

  it("confirms with the outcome button, primary on top and cancel under it", async () => {
    const onConfirm = vi.fn();
    renderWithIntl(<ConfirmHarness onConfirm={onConfirm} destructive />);
    const dialog = await screen.findByRole("dialog");
    const buttons = Array.from(dialog.querySelectorAll("button")).map((button) => button.textContent);
    expect(buttons).toEqual(["Ja, avslutt kampen", "Avbryt"]);
    expect(screen.getByRole("button", { name: "Ja, avslutt kampen" }).className).toMatch(/destructive/);

    fireEvent.click(screen.getByRole("button", { name: "Ja, avslutt kampen" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("cancels without confirming", async () => {
    const onConfirm = vi.fn();
    renderWithIntl(<ConfirmHarness onConfirm={onConfirm} />);
    await screen.findByRole("dialog");
    expect(screen.getByRole("button", { name: "Ja, avslutt kampen" }).className).toMatch(/primary/);
    fireEvent.click(screen.getByRole("button", { name: "Avbryt" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("ignores confirm presses while pending, keeps focusability, and accepts a custom cancel label", async () => {
    const onConfirm = vi.fn();
    renderWithIntl(
      <ConfirmSheet
        open
        onOpenChange={() => undefined}
        title="Avslutte omgangen?"
        confirmLabel="Ja, avslutt omgangen"
        cancelLabel="Fortsett å spille"
        pending
        onConfirm={onConfirm}
      />,
    );
    await screen.findByRole("dialog");
    const confirm = screen.getByRole("button", { name: "Ja, avslutt omgangen" });
    expect(confirm.getAttribute("aria-disabled")).toBe("true");
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Fortsett å spille" })).toBeTruthy();
  });

  it("uses English copy in the en locale", async () => {
    renderWithIntl(
      <ConfirmSheet open onOpenChange={() => undefined} title="End?" confirmLabel="Yes" onConfirm={() => undefined} />,
      "en",
    );
    await screen.findByRole("dialog");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });
});
