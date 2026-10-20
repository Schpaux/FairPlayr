import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WifiOff } from "lucide-react";
import { Notice } from "./Notice";
import { renderWithIntl } from "./testUtils";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Notice", () => {
  it("is a polite status by default, without a tone word for plain info", () => {
    renderWithIntl(<Notice>Appen var lukket i 7 min.</Notice>);
    const notice = screen.getByRole("status");
    expect(notice.textContent).toBe("Appen var lukket i 7 min.");
    expect(notice.dataset.tone).toBe("info");
  });

  it("announces errors assertively and warnings politely", () => {
    renderWithIntl(
      <>
        <Notice tone="error">Kunne ikke lagre.</Notice>
        <Notice tone="warning">Krever nett.</Notice>
      </>,
    );
    expect(screen.getByRole("alert").textContent).toContain("Feil: Kunne ikke lagre.");
    expect(screen.getByRole("status").textContent).toContain("Advarsel: Krever nett.");
  });

  it("can stay silent for static notes", () => {
    renderWithIntl(<Notice announce="off">Historikk krever nett.</Notice>);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Historikk krever nett.")).toBeTruthy();
  });

  it("always shows a glyph, and accepts a replacement", () => {
    const { container } = renderWithIntl(
      <Notice tone="warning" icon={WifiOff} title="Krever nett">
        Historikken lastes når du er på nett igjen.
      </Notice>,
    );
    const glyph = container.querySelector("svg");
    expect(glyph).toBeTruthy();
    expect(glyph?.closest("[aria-hidden]")).toBeTruthy();
    expect(screen.getByText("Krever nett").tagName).toBe("STRONG");
    // Title and body read as two words, not "nettHistorikken".
    expect(container.textContent).toContain("Krever nett Historikken");
  });

  it("renders an action and a 44px dismiss button with a localised label", () => {
    const onDismiss = vi.fn();
    renderWithIntl(
      <Notice onDismiss={onDismiss} action={<button type="button">Prøv igjen</button>}>
        Synk feilet.
      </Notice>,
    );
    expect(screen.getByRole("button", { name: "Prøv igjen" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Lukk meldingen" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("auto-dismisses once after the given time, even if the callback changes", () => {
    vi.useFakeTimers();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderWithIntl(
      <Notice onDismiss={first} autoDismissMs={8000}>
        Appen var lukket i 7 min.
      </Notice>,
    );
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    rerender(
      <Notice onDismiss={second} autoDismissMs={8000}>
        Appen var lukket i 7 min.
      </Notice>,
    );
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("pauses the timer while hovered or focused", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    renderWithIntl(
      <Notice onDismiss={onDismiss} autoDismissMs={8000} testId="n">
        Appen var lukket i 7 min.
      </Notice>,
    );
    const notice = screen.getByTestId("n");
    fireEvent.pointerEnter(notice);
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.pointerLeave(notice);
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("never auto-dismisses warnings, errors or notices with an action", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    renderWithIntl(
      <>
        <Notice tone="warning" onDismiss={onDismiss} autoDismissMs={1000}>A</Notice>
        <Notice tone="error" onDismiss={onDismiss} autoDismissMs={1000}>B</Notice>
        <Notice onDismiss={onDismiss} autoDismissMs={1000} action={<button type="button">Oppdater</button>}>C</Notice>
      </>,
    );
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("does not auto-dismiss without a time", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    renderWithIntl(<Notice onDismiss={onDismiss}>Melding.</Notice>);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
