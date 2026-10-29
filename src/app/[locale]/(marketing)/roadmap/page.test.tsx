import { render, screen } from "@testing-library/react";
import { createTranslator, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import no from "../../../../../messages/no.json";
import type { PublicMilestone } from "@/lib/marketing/roadmap";

const source = vi.hoisted(() => ({ latest: null as PublicMilestone | null }));
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(), getMessages: async () => no,
  getTranslations: async (namespace: string) => createTranslator({ locale: "no", messages: no as AbstractIntlMessages, namespace }),
}));
vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children, ...props }: React.ComponentProps<"a">) => <a href={href} {...props}>{children}</a> }));
vi.mock("@/components/marketing/SiteHeader", () => ({ SiteHeader: () => <header /> }));
vi.mock("@/components/marketing/RoadmapShareDemo", () => ({ RoadmapShareDemo: () => <div data-testid="roadmap-share-demo" /> }));
vi.mock("@/lib/marketing/roadmap", async (original) => ({
  ...await original<typeof import("@/lib/marketing/roadmap")>(),
  getWebsiteRoadmap: () => ({ latest: source.latest, upcoming: [], released: source.latest ? [source.latest] : [] }),
}));
import RoadmapPage from "./page";

const milestone: PublicMilestone = { id: "new-release", title: "En ny milepæl", summary: "Milepælens egen offentlige beskrivelse.", milestone: true, state: "released", date: "2026-10-29", dateKind: "released" };

describe("featured roadmap milestone", () => {
  it("renders a complete static feature when the newest milestone has no preview", async () => {
    source.latest = milestone;
    const { container } = render(await RoadmapPage({ params: Promise.resolve({ locale: "no" }) }));
    expect(container.querySelector('[data-preview="static"]')).not.toBeNull();
    expect(screen.getByRole("heading", { name: milestone.title, level: 2 })).toBeTruthy();
    expect(screen.getAllByText(milestone.summary).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("roadmap-share-demo")).toBeNull();
    expect(container.querySelector('a[href$="/play"]')).toBeNull();
  });

  it("uses the live preview only for a milestone it can actually demonstrate", async () => {
    source.latest = { ...milestone, id: "FEAT-SHARE-01" };
    const { container } = render(await RoadmapPage({ params: Promise.resolve({ locale: "no" }) }));
    expect(container.querySelector('[data-preview="live"]')).not.toBeNull();
    expect(screen.getByTestId("roadmap-share-demo")).toBeTruthy();
  });
});
