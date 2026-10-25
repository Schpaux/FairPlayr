import { cleanup, render, screen } from "@testing-library/react";
import { notFound, redirect } from "next/navigation";
import { Component, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { AppShellErrorBoundary } from "@/components/layout/AppShellErrorBoundary";
import en from "../../../messages/en.json";
import no from "../../../messages/no.json";

// Stands in for the Next.js boundaries (not-found, redirect) that sit above the
// app shell: it records whatever reaches it.
class OuterBoundary extends Component<
  { children: ReactNode },
  { caught: unknown }
> {
  override state: { caught: unknown } = { caught: null };

  static getDerivedStateFromError(caught: unknown) {
    return { caught };
  }

  override render() {
    if (this.state.caught) {
      const digest = (this.state.caught as { digest?: string }).digest;
      return <p data-testid="outer">{digest ?? "outer"}</p>;
    }
    return this.props.children;
  }
}

function Throws({ error }: { error: () => never }): ReactNode {
  return error();
}

function renderInShell(error: () => never, locale: "en" | "no" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : no}>
      <OuterBoundary>
        <AppShellErrorBoundary>
          <Throws error={error} />
        </AppShellErrorBoundary>
      </OuterBoundary>
    </NextIntlClientProvider>,
  );
}

describe("AppShellErrorBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows the recovery screen for an ordinary render error", () => {
    renderInShell(() => {
      throw new Error("boom");
    });

    expect(screen.getByText("Something went wrong")).toBeTruthy();
    expect(screen.queryByTestId("outer")).toBeNull();
  });

  it("speaks Norwegian in Norwegian (UI-I18N-01)", () => {
    renderInShell(() => {
      throw new Error("boom");
    }, "no");

    expect(screen.getByRole("heading", { name: "Noe gikk galt" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Prøv igjen" })).toBeTruthy();
  });

  // STAB-09: notFound() from a page under [locale] must reach the Next.js
  // not-found boundary, not the shell's "Something went wrong" screen.
  it("lets notFound() through to the Next.js boundary", () => {
    renderInShell(() => notFound());

    expect(screen.getByTestId("outer").textContent).toBe(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );
    expect(screen.queryByText("Something went wrong")).toBeNull();
  });

  it("lets redirect() through to the Next.js boundary", () => {
    renderInShell(() => redirect("/no"));

    expect(screen.getByTestId("outer").textContent).toMatch(/^NEXT_REDIRECT;/);
    expect(screen.queryByText("Something went wrong")).toBeNull();
  });
});
