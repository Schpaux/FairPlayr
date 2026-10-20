import type { ReactNode } from "react";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ListGroup, ListRow } from "./List";
import { EmptyState } from "./EmptyState";
import { Skeleton, SkeletonList } from "./Skeleton";
import { renderWithIntl } from "./testUtils";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

describe("ListGroup and ListRow", () => {
  it("names the list by its title and renders each row as a list item", () => {
    renderWithIntl(
      <ListGroup title="Laget">
        <ListRow label="Spillere" trailing="11" href="/team" />
        <ListRow label="Emma Haugen" description="Nr. 6 · 34′ totalt" />
      </ListGroup>,
    );
    const list = screen.getByRole("list", { name: "Laget" });
    expect(list.querySelectorAll(":scope > li")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Laget", level: 2 })).toBeTruthy();
  });

  it("uses aria-label when there is no visible title", () => {
    renderWithIntl(
      <ListGroup aria-label="Kampvalg">
        <ListRow label="Hendelser" onClick={() => undefined} />
      </ListGroup>,
    );
    expect(screen.getByRole("list", { name: "Kampvalg" })).toBeTruthy();
  });

  it("renders a link row as a single link with a chevron", () => {
    renderWithIntl(
      <ListGroup aria-label="x">
        <ListRow label="Spillere" trailing="11" href="/team" />
      </ListGroup>,
    );
    const link = screen.getByRole("link", { name: /Spillere/ });
    expect(link.getAttribute("href")).toBe("/team");
    expect(link.querySelector("button")).toBeNull();
    expect(link.querySelector("svg")).toBeTruthy();
  });

  it("renders a button row that can be disabled", () => {
    const onClick = vi.fn();
    renderWithIntl(
      <ListGroup aria-label="x">
        <ListRow label="Slett laget" destructive onClick={onClick} />
        <ListRow label="Fjern mål" onClick={onClick} disabled />
      </ListGroup>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Slett laget" }));
    fireEvent.click(screen.getByRole("button", { name: "Fjern mål" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Slett laget" }).className).toMatch(/rowDestructive/);
  });

  it("renders a static row without any interactive element", () => {
    renderWithIntl(
      <ListGroup aria-label="x">
        <ListRow label="Emma Haugen" />
      </ListGroup>,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Emma Haugen")).toBeTruthy();
  });
});

describe("EmptyState", () => {
  it("renders a title, description and one action", () => {
    renderWithIntl(
      <EmptyState
        title="Ingen spillere ennå"
        description="Legg til spillerne på laget før første kamp."
        action={<button type="button">Legg til spiller</button>}
      />,
    );
    expect(screen.getByRole("heading", { name: "Ingen spillere ennå" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Legg til spiller" })).toBeTruthy();
  });

  it("can render the title as a paragraph", () => {
    renderWithIntl(<EmptyState title="Tomt" titleAs="p" />);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByText("Tomt").tagName).toBe("P");
  });
});

describe("Skeleton", () => {
  it("is decorative on its own", () => {
    const { container } = renderWithIntl(<Skeleton width={120} height={20} radius="pill" />);
    const block = container.firstElementChild as HTMLElement;
    expect(block.getAttribute("aria-hidden")).toBe("true");
    expect(block.style.width).toBe("120px");
    expect(block.style.borderRadius).toBe("999px");
  });

  it("announces a loading list once", () => {
    renderWithIntl(<SkeletonList rows={4} withDescription />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Laster …");
    expect(status.querySelectorAll("li")).toHaveLength(4);
  });
});
