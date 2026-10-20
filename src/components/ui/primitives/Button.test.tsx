import type { ReactNode } from "react";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button, ButtonLink } from "./Button";
import { renderWithIntl } from "./testUtils";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

describe("Button", () => {
  it("is a type=button pill that defaults to secondary and medium", () => {
    renderWithIntl(<Button>Bytt plass</Button>);
    const button = screen.getByRole("button", { name: "Bytt plass" });
    expect(button.getAttribute("type")).toBe("button");
    expect(button.className).toMatch(/secondary/);
    expect(button.className).not.toMatch(/\bsm\b/);
  });

  it("applies variant, size and block classes", () => {
    renderWithIntl(
      <Button variant="primary" size="sm" block>
        Avspark
      </Button>,
    );
    const className = screen.getByRole("button", { name: "Avspark" }).className;
    expect(className).toMatch(/primary/);
    expect(className).toMatch(/sm/);
    expect(className).toMatch(/block/);
  });

  it("uses a real disabled attribute and does not fire when disabled", () => {
    const onClick = vi.fn();
    renderWithIntl(
      <Button disabled onClick={onClick}>
        Lagre
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Lagre" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("keeps the label as the accessible name when it has an icon", () => {
    renderWithIntl(<Button icon={<svg data-testid="glyph" />}>Angre</Button>);
    expect(screen.getByRole("button", { name: "Angre" })).toBeTruthy();
    expect(screen.getByTestId("glyph").parentElement?.getAttribute("aria-hidden")).toBe("true");
  });

  it("passes a submit type and refs through", () => {
    let node: HTMLButtonElement | null = null;
    renderWithIntl(
      <Button type="submit" ref={(element) => { node = element; }}>
        Send
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Send" }).getAttribute("type")).toBe("submit");
    expect(node).toBeInstanceOf(HTMLButtonElement);
  });
});

describe("ButtonLink", () => {
  it("renders one link with the pill classes, never a button inside a link", () => {
    renderWithIntl(
      <ButtonLink href="/match/setup" variant="primary">
        Start kamp
      </ButtonLink>,
    );
    const link = screen.getByRole("link", { name: "Start kamp" });
    expect(link.getAttribute("href")).toBe("/match/setup");
    expect(link.className).toMatch(/primary/);
    expect(link.querySelector("button")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
