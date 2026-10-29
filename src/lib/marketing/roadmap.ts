import roadmap from "../../../roadmap/roadmap.json";
import { publicRoadmap } from "../../../scripts/roadmap/lib.mjs";
import type { WebsiteLocale } from "./seo";

interface RoadmapSource {
  updated: string;
  items: {
    id: string;
    type: string;
    status: string;
    decision: string;
    dates?: { released?: string; released_no_later_than?: string };
    public?: { visible?: boolean };
  }[];
}

export interface PublicMilestone {
  id: string;
  title: string;
  summary: string;
  milestone: boolean;
  state: "released" | "in_progress" | "planned";
  date: string | null;
  dateKind: "released" | "available_by" | null;
}

/**
 * Reuse the curated public copy, without interpreting "built" as "released".
 * The existing fields suffice: no second content list or publication dates.
 * Only this public projection is rendered; internal source data stays on the server.
 */
export function websiteRoadmap(data: RoadmapSource, locale: WebsiteLocale) {
  const eligible = data.items.filter((item) =>
    item.public?.visible === true && ["initiative", "feature", "task"].includes(item.type) &&
    ["completed", "committed"].includes(item.decision),
  );
  const selected = publicRoadmap({ ...data, items: eligible }, locale);
  const byId = new Map(eligible.map((item) => [item.id, item]));
  const items: PublicMilestone[] = [...selected.upcoming, ...selected.shipped].map((item) => {
    const source = byId.get(item.id)!;
    const dates = source.dates;
    const released = source.status === "released" || Boolean(dates?.released || dates?.released_no_later_than);
    return {
      id: item.id, title: item.title, summary: item.summary, milestone: item.milestone,
      state: released ? "released" : source.status === "not_started" ? "planned" : "in_progress",
      date: released ? dates?.released ?? dates?.released_no_later_than ?? null : null,
      dateKind: !released ? null : dates?.released ? "released" : dates?.released_no_later_than ? "available_by" : null,
    };
  });
  const released = items.filter((item) => item.state === "released")
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || a.id.localeCompare(b.id));
  return {
    developing: items.filter((item) => item.state === "in_progress"),
    planned: items.filter((item) => item.state === "planned"),
    released,
    latest: released.find((item) => item.milestone) ?? released[0] ?? null,
  };
}

export function getWebsiteRoadmap(locale: WebsiteLocale) {
  return websiteRoadmap(roadmap, locale);
}

/** Preserve the source's precision; never turn a year/month into an invented day. */
export function formatRoadmapDate(date: string, locale: WebsiteLocale, monthOnly = false): string {
  const parts = date.split("-");
  return new Intl.DateTimeFormat(locale === "no" ? "nb-NO" : "en-GB", {
    year: "numeric", ...(parts.length > 1 ? { month: "long" as const } : {}),
    ...(parts.length > 2 && !monthOnly ? { day: "numeric" as const } : {}), timeZone: "UTC",
  }).format(new Date(`${parts[0]}-${parts[1] ?? "01"}-${parts[2] ?? "01"}T12:00:00Z`));
}
