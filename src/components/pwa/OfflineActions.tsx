"use client";

import { useTranslations } from "next-intl";
import { useActiveMatch } from "@/components/providers/ActiveMatchProvider";
import { Button, ButtonLink } from "@/components/ui/primitives/Button";
import { ListGroup, ListRow } from "@/components/ui/primitives/List";

/**
 * The offline page's actions. The next action (lime) is the way back to the
 * match when one is active on this device, otherwise Home; both open offline.
 * Reads only this device (ActiveMatchProvider), never the server.
 */
export function OfflineActions() {
  const t = useTranslations("pwa.offline");
  const { activeMatch, activeMatchHref } = useActiveMatch();

  return (
    <>
      <div className="flex flex-col gap-3">
        {activeMatch ? (
          <ButtonLink href={activeMatchHref} variant="primary" block data-testid="offline-to-match">
            {t("toMatch")}
          </ButtonLink>
        ) : (
          <ButtonLink href="/" variant="primary" block>
            {t("toHome")}
          </ButtonLink>
        )}
        <Button variant="secondary" block onClick={() => window.location.reload()}>
          {t("retry")}
        </Button>
      </div>
      <ListGroup title={t("availableTitle")}>
        <ListRow href="/match/setup" label={t("setup")} />
        <ListRow href="/team" label={t("team")} />
      </ListGroup>
    </>
  );
}
