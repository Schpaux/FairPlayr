"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeft, Inbox, Play, Trash2, Users, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Button,
  ButtonLink,
  ConfirmSheet,
  EmptyState,
  ListGroup,
  ListRow,
  Notice,
  SegmentedChoice,
  Sheet,
  Skeleton,
  SkeletonList,
} from "@/components/ui/primitives";
import { MatchPlayingTime } from "@/components/match/MatchPlayingTime";
import { summarizeMatchPlayingTime } from "@/domain/matchPlayingTime";
import { APP_HOME_PATH } from "@/lib/appRoutes";

const ICON = { size: 20, strokeWidth: 1.75 } as const;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`gallery-${id}`} className="space-y-3" data-testid={`gallery-${id}`}>
      <h2 id={`gallery-${id}`} className="text-xl font-semibold tracking-tight text-fp-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function UiGallery() {
  const t = useTranslations("uiGallery");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [noticeVisible, setNoticeVisible] = useState(true);
  const [format, setFormat] = useState<"5v5" | "7v7" | "9v9">("7v7");

  return (
    <div
      className="mx-auto max-w-screen-sm space-y-8 px-4 py-6"
      data-testid="ui-gallery"
      // Marks hydration (the ref runs on the client commit), so tests never click inert SSR markup.
      ref={(node) => {
        if (node) node.dataset.hydrated = "true";
      }}
    >
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-fp-ink">{t("title")}</h1>
        <p className="text-base text-fp-ink-2">{t("subtitle")}</p>
      </header>

      <Section id="buttons" title={t("buttons")}>
        <div className="grid gap-2">
          <Button variant="primary" block icon={<Play {...ICON} />}>
            {t("primary")}
          </Button>
          <Button variant="secondary" block>
            {t("secondary")}
          </Button>
          <Button variant="destructive" block>
            {t("destructive")}
          </Button>
          <Button variant="primary" block disabled>
            {t("disabled")}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm">
            {t("small")}
          </Button>
          <Button variant="secondary" size="sm">
            {t("small")}
          </Button>
          <Button variant="ghost" size="sm">
            {t("ghost")}
          </Button>
          <ButtonLink href={APP_HOME_PATH} variant="secondary" size="sm" icon={<ArrowLeft {...ICON} />}>
            {t("link")}
          </ButtonLink>
        </div>
      </Section>

      <Section id="sheets" title={t("sheets")}>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setSheetOpen(true)} data-testid="gallery-open-sheet">
            {t("openSheet")}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setConfirmed(false);
              setConfirmOpen(true);
            }}
            data-testid="gallery-open-confirm"
          >
            {t("openConfirm")}
          </Button>
        </div>
        {confirmed ? (
          <Notice tone="success" testId="gallery-confirmed">
            {t("confirmed")}
          </Notice>
        ) : null}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen} title={t("sheetTitle")} description={t("sheetBody")} testId="gallery-sheet">
          <SegmentedChoice label={t("segmentedLabel")} options={FORMAT_OPTIONS} value={format} onValueChange={setFormat} />
        </Sheet>
        <ConfirmSheet
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={t("confirmTitle")}
          description={t("confirmBody")}
          confirmLabel={t("destructive")}
          destructive
          onConfirm={() => {
            setConfirmed(true);
            setConfirmOpen(false);
          }}
          testId="gallery-confirm"
        />
      </Section>

      <Section id="notices" title={t("notices")}>
        <div className="grid gap-2">
          {noticeVisible ? (
            <Notice onDismiss={() => setNoticeVisible(false)} testId="gallery-notice-info">
              {t("noticeInfo")}
            </Notice>
          ) : null}
          <Notice tone="success" announce="off">
            {t("noticeSuccess")}
          </Notice>
          <Notice tone="warning" icon={WifiOff} title={t("noticeWarningTitle")} announce="off">
            {t("noticeWarning")}
          </Notice>
          <Notice
            tone="error"
            announce="off"
            action={
              <Button variant="secondary" size="sm">
                {t("noticeAction")}
              </Button>
            }
          >
            {t("noticeError")}
          </Notice>
        </div>
      </Section>

      <Section id="lists" title={t("lists")}>
        <ListGroup title={t("listTitle")} titleAs="h3">
          <ListRow label={t("rowPlayers")} trailing={t("rowPlayersValue")} leading={<Users {...ICON} />} href="/team" />
          <ListRow label={t("rowFormat")} trailing={t("rowFormatValue")} onClick={() => setSheetOpen(true)} />
          <ListRow label={t("rowStatic")} description={t("rowStaticDescription")} />
        </ListGroup>
        <ListGroup aria-label={t("rowDelete")}>
          <ListRow label={t("rowDelete")} leading={<Trash2 {...ICON} />} destructive onClick={() => setConfirmOpen(true)} />
        </ListGroup>
      </Section>

      <Section id="empty" title={t("empty")}>
        <div className="rounded-[14px] border border-fp-rule bg-fp-surface">
          <EmptyState
            icon={Inbox}
            title={t("emptyTitle")}
            titleAs="h3"
            description={t("emptyDescription")}
            action={<Button variant="primary">{t("emptyAction")}</Button>}
          />
        </div>
      </Section>

      <Section id="skeleton" title={t("skeleton")}>
        <div className="flex items-center gap-3">
          <Skeleton width={44} height={44} radius="pill" />
          <Skeleton width="50%" height={16} />
        </div>
        <SkeletonList rows={3} withDescription />
      </Section>

      <Section id="playing-time" title={t("playingTime")}>
        <MatchPlayingTime summary={PLAYING_TIME} names={PLAYING_TIME_NAMES} titleAs="h3" />
      </Section>

      <Section id="segmented" title={t("segmented")}>
        <SegmentedChoice label={t("segmentedLabel")} options={FORMAT_OPTIONS} value={format} onValueChange={setFormat} />
        <p className="text-sm text-fp-ink-2">{t("reducedMotion")}</p>
      </Section>
    </div>
  );
}

const FORMAT_OPTIONS = [
  { value: "5v5", label: "5v5" },
  { value: "7v7", label: "7v7" },
  { value: "9v9", label: "9v9" },
] as const;

// UI-DETAIL-01 fixture: a stored 7v7 match, 2 × 20, squad of 10. Two
// substitutions (12′ and 20′), one player never on; read like a real one.
const MIN = 60_000;
const PLAYING_TIME = summarizeMatchPlayingTime(
  {
    format: "7v7",
    clock: { startedAtMs: 0, pausedAtMs: 40 * MIN, accumulatedPausedMs: 0, isRunning: false },
    initialOnFieldPlayerIds: ["p1", "p2", "p3", "p4", "p5", "p6", "p7"],
    onFieldPlayerIds: ["p1", "p2", "p3", "p4", "p5", "p8", "p9"],
    benchPlayerIds: ["p6", "p7", "p10"],
    playerAccumulatedMs: { p1: 0, p2: 0, p3: 0, p4: 0, p5: 0, p6: 12 * MIN, p7: 20 * MIN, p8: 0, p9: 0, p10: 0 },
    onFieldStartedAtElapsedMs: { p1: 0, p2: 0, p3: 0, p4: 0, p5: 0, p6: null, p7: null, p8: 12 * MIN, p9: 20 * MIN, p10: null },
  },
  { nowMs: 0 }
);
const PLAYING_TIME_NAMES = new Map(
  ["Frida Berg", "Ida Ruud", "Selma Lie", "Vilde Moe", "Maja Dahl", "Emma Haugen", "Emma Hansen", "Thea Strand", "Ingrid Lund", "Sofie Bakke"].map(
    (name, index) => [`p${index + 1}`, name]
  )
);
