// MATCH-03: "Avslutt" and "Forkast" on an ongoing match are confirmed first.
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/components/ui/primitives/testUtils";
import {
  ActiveMatchCloseConfirm,
  useActiveMatchCloseConfirm,
  type ActiveMatchCloseAction,
} from "@/components/match/ActiveMatchCloseConfirm";
import no from "../../../messages/no.json";

vi.mock("@/i18n/navigation", () => ({ Link: () => null }));

afterEach(cleanup);

function Harness({ run }: { run: (action: ActiveMatchCloseAction) => Promise<void> }) {
  const state = useActiveMatchCloseConfirm(run);
  return (
    <>
      <button type="button" onClick={() => state.request("end", "Lyn – Fram")}>
        Avslutt
      </button>
      <button type="button" onClick={() => state.request("discard", "Lyn – Fram")}>
        Forkast
      </button>
      <ActiveMatchCloseConfirm state={state} />
    </>
  );
}

const copy = no.matchClose;

async function open(trigger: "Avslutt" | "Forkast", title: string) {
  fireEvent.click(screen.getByRole("button", { name: trigger }));
  return within(await screen.findByRole("dialog", { name: title }));
}

describe("ActiveMatchCloseConfirm", () => {
  it("does nothing on the first tap: Forkast says what is deleted, and Behold kampen keeps it", async () => {
    const run = vi.fn(() => Promise.resolve());
    renderWithIntl(<Harness run={run} />);

    const sheet = await open("Forkast", "Forkaste Lyn – Fram?");
    sheet.getByText(copy.discard.description);
    expect(run).not.toHaveBeenCalled();

    fireEvent.click(sheet.getByRole("button", { name: copy.cancel }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(run).not.toHaveBeenCalled();
  });

  it("runs the confirmed action once and closes when it is done", async () => {
    let finish: () => void = () => {};
    const run = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    renderWithIntl(<Harness run={run} />);

    const sheet = await open("Avslutt", "Avslutte Lyn – Fram?");
    sheet.getByText(copy.end.description);
    const confirm = sheet.getByRole("button", { name: copy.end.confirm });
    fireEvent.click(confirm);
    // A second press while it runs is ignored (no double close).
    expect(confirm.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(confirm);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("end");

    finish();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("runs the discard action when Forkast is confirmed", async () => {
    const run = vi.fn(() => Promise.resolve());
    renderWithIntl(<Harness run={run} />);

    const sheet = await open("Forkast", "Forkaste Lyn – Fram?");
    fireEvent.click(sheet.getByRole("button", { name: copy.discard.confirm }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("discard");
  });

  it("closes, and is usable again, if the action throws", async () => {
    const run = vi.fn(() => Promise.reject(new Error("offline")));
    renderWithIntl(<Harness run={run} />);

    const sheet = await open("Avslutt", "Avslutte Lyn – Fram?");
    fireEvent.click(sheet.getByRole("button", { name: copy.end.confirm }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await open("Avslutt", "Avslutte Lyn – Fram?");
  });

  it("uses the destructive fill only for Forkast", async () => {
    renderWithIntl(<Harness run={() => Promise.resolve()} />);

    const discard = await open("Forkast", "Forkaste Lyn – Fram?");
    const discardClass = discard.getByRole("button", { name: copy.discard.confirm }).className;
    fireEvent.click(discard.getByRole("button", { name: copy.cancel }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const end = await open("Avslutt", "Avslutte Lyn – Fram?");
    const endClass = end.getByRole("button", { name: copy.end.confirm }).className;
    expect(discardClass).toMatch(/destructive/);
    expect(endClass).not.toMatch(/destructive/);
  });
});
