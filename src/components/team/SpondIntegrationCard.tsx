"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, CircleDashed, Link2, LoaderCircle, RefreshCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, ConfirmSheet, ListGroup, ListRow, Notice } from "@/components/ui/primitives";
import { teamTextInputClassName } from "@/components/team/styles";
import { SpondImportSheet } from "@/components/team/spond/SpondImportSheet";
import {
  parseApiError,
  type SpondEventOption,
  type SpondGroupOption,
  type SpondImportPreviewCandidate,
  type SpondResetAction,
} from "@/components/team/spond/types";
import type { TeamStorageMode } from "@/lib/teamData/types";
import { cn } from "@/lib/utils";

interface SpondIntegrationCardProps {
  teamId: string;
  mode: TeamStorageMode;
  onImported: () => Promise<void>;
  /**
   * Active players on the team that came from Spond (`source === "spond"`).
   * Shown in the «Fra Spond» summary and the delete confirmations; without it
   * the copy says the same thing without a number.
   */
  spondPlayerCount?: number;
  /** Hide the «Spond» heading when the surrounding sheet or page already names it. */
  showTitle?: boolean;
}

/**
 * Where a message is shown: next to the action that caused it (UI-SPOND-01).
 * Every handler below keeps its requests and order; the anchor is only set by
 * the control that started it.
 */
type FeedbackAnchor = "status" | "connect" | "groups" | "link" | "import" | "events" | "reset";
type FeedbackSlot = "status" | "connect" | "group" | "import" | "sheet" | "events" | "danger";

const SECTION_TITLE = "text-[13px] font-semibold uppercase leading-tight tracking-[0.06em] text-fp-ink-2";

export function SpondIntegrationCard({
  teamId,
  mode,
  onImported,
  spondPlayerCount,
  showTitle = true,
}: SpondIntegrationCardProps) {
  const t = useTranslations("team.spond");
  const unknownError = t("errors.unknown");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [isSavingLink, setIsSavingLink] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isLoadingImportPreview, setIsLoadingImportPreview] = useState(false);
  const [isSyncingEvents, setIsSyncingEvents] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [accountLabel, setAccountLabel] = useState<string | null>(null);
  const [groups, setGroups] = useState<SpondGroupOption[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [linkedGroupId, setLinkedGroupId] = useState<string | null>(null);
  const [linkedGroupName, setLinkedGroupName] = useState<string | null>(null);
  const [membersLastSyncedAt, setMembersLastSyncedAt] = useState<string | null>(null);
  const [eventsLastSyncedAt, setEventsLastSyncedAt] = useState<string | null>(null);
  const [events, setEvents] = useState<SpondEventOption[]>([]);
  const [importPreviewCandidates, setImportPreviewCandidates] = useState<SpondImportPreviewCandidate[]>([]);
  const [selectedCandidateExternalIds, setSelectedCandidateExternalIds] = useState<string[]>([]);
  const [pendingResetAction, setPendingResetAction] = useState<SpondResetAction | null>(null);
  // UI-A11Y-02: both clean-ups delete data, so each is confirmed first. The
  // action is kept after closing so the copy does not change on the way out.
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetConfirmAction, setResetConfirmAction] = useState<SpondResetAction>("delete-imported-data");

  // Presentation only (UI-SPOND-01).
  const [feedbackAnchor, setFeedbackAnchor] = useState<FeedbackAnchor>("status");
  const [importSheetOpen, setImportSheetOpen] = useState(false);
  // The first status check, per team: until it answers the card says
  // "checking", and if it fails it says so instead of "not connected".
  const [statusCheck, setStatusCheck] = useState<{ teamId: string; ok: boolean } | null>(null);

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) ?? null,
    [groups, selectedGroupId]
  );

  const mapErrorMessage = useCallback((code: string, fallback: string) => {
    switch (code) {
      case "UNAUTHORIZED":
        return t("errors.unauthorized");
      case "TEAM_NOT_FOUND":
        return t("errors.teamAccess");
      case "INVALID_CREDENTIALS":
        return t("errors.invalidCredentials");
      case "SPOND_2FA_REQUIRED":
        return t("errors.twoFactorRequired");
      case "SPOND_RATE_LIMITED":
        return t("errors.rateLimited");
      case "SPOND_UNAVAILABLE":
        return t("errors.spondUnavailable");
      case "SPOND_AUTH_FAILED":
      case "SPOND_BAD_RESPONSE":
        return t("errors.authFailed");
      case "CONNECTION_NOT_FOUND":
        return t("errors.notConnected");
      case "NO_MEMBERS_FOUND":
        return t("errors.noMembers");
      case "GROUP_NOT_FOUND":
        return t("errors.groupNotFound");
      case "TEAM_LINK_NOT_FOUND":
        return t("errors.groupNotLinked");
      case "ENCRYPTION_NOT_CONFIGURED":
        return t("errors.encryptionNotConfigured");
      case "NO_SELECTED_MEMBERS":
        return t("errors.noSelectedMembers");
      case "MATCH_CLEANUP_FAILED":
      case "EVENT_LINK_DELETE_FAILED":
      case "RSVP_SNAPSHOT_DELETE_FAILED":
      case "PLAYER_DEACTIVATE_FAILED":
      case "TEAM_LINK_DELETE_FAILED":
      case "TEAM_LINK_SYNC_MARK_FAILED":
      case "CONNECTION_SAVE_FAILED":
        return t("errors.cleanupFailed");
      default:
        return fallback;
    }
  }, [t]);

  const loadStatus = useCallback(async () => {
    setError(null);

    const response = await fetch(`/api/integrations/spond/status?teamId=${encodeURIComponent(teamId)}`, {
      method: "GET",
    });

    const payload = (await response.json()) as unknown;

    if (!response.ok) {
      const parsed = parseApiError(payload, unknownError);
      throw new Error(mapErrorMessage(parsed.code, parsed.message));
    }

    const data = payload as {
      connected: boolean;
      accountLabel: string | null;
      teamLink: {
        externalTeamId: string;
        externalTeamName: string;
        membersLastSyncedAt: string | null;
        eventsLastSyncedAt: string | null;
      } | null;
    };

    setConnected(data.connected);
    setAccountLabel(data.accountLabel);
    setLinkedGroupId(data.teamLink?.externalTeamId ?? null);
    setLinkedGroupName(data.teamLink?.externalTeamName ?? null);
    setMembersLastSyncedAt(data.teamLink?.membersLastSyncedAt ?? null);
    setEventsLastSyncedAt(data.teamLink?.eventsLastSyncedAt ?? null);
    if (!data.teamLink) {
      setEvents([]);
    }
  }, [mapErrorMessage, teamId, unknownError]);

  const formatSyncedAt = (value: string | null) => {
    if (!value) {
      return t("neverSynced");
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return t("neverSynced");
    }

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  };

  const formatEventDate = (value: string | null) => {
    if (!value) {
      return t("eventUnknownDate");
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return t("eventUnknownDate");
    }

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  };

  const loadGroups = useCallback(async () => {
    setIsLoadingGroups(true);
    setError(null);

    try {
      const response = await fetch("/api/integrations/spond/groups", { method: "GET" });
      const payload = (await response.json()) as unknown;

      if (!response.ok) {
        const parsed = parseApiError(payload, unknownError);
        throw new Error(mapErrorMessage(parsed.code, parsed.message));
      }

      const data = payload as { groups: SpondGroupOption[] };
      const nextGroups = data.groups ?? [];
      setGroups(nextGroups);

      if (nextGroups.length === 0) {
        setNotice(t("noGroups"));
        return;
      }

      const nextSelected =
        linkedGroupId && nextGroups.some((group) => group.id === linkedGroupId)
          ? linkedGroupId
          : nextGroups[0].id;

      setSelectedGroupId(nextSelected);
    } finally {
      setIsLoadingGroups(false);
    }
  }, [linkedGroupId, mapErrorMessage, t, unknownError]);

  useEffect(() => {
    if (mode !== "cloud") {
      return;
    }

    void (async () => {
      try {
        await loadStatus();
        setStatusCheck({ teamId, ok: true });
      } catch (cause) {
        setStatusCheck({ teamId, ok: false });
        setFeedbackAnchor("status");
        setError(cause instanceof Error ? cause.message : t("errors.generic"));
      }
    })();
  }, [loadStatus, mode, teamId, t]);

  useEffect(() => {
    if (!connected || mode !== "cloud") {
      return;
    }

    void (async () => {
      try {
        await loadGroups();
      } catch (cause) {
        // Only a failure moves the feedback here; a reload must not pull a
        // notice away from the action that caused it.
        setFeedbackAnchor("groups");
        setError(cause instanceof Error ? cause.message : t("errors.generic"));
      }
    })();
  }, [connected, loadGroups, mode, t]);

  const handleConnect = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setError(null);
    setNotice(null);
    setIsConnecting(true);

    try {
      const response = await fetch("/api/integrations/spond/connect", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const payload = (await response.json()) as unknown;

      if (!response.ok) {
        const parsed = parseApiError(payload, unknownError);
        throw new Error(mapErrorMessage(parsed.code, parsed.message));
      }

      const data = payload as { accountLabel: string | null };
      setConnected(true);
      setAccountLabel(data.accountLabel ?? null);
      setNotice(t("connected"));
      await loadGroups();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("errors.generic"));
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSaveLink = async () => {
    if (!selectedGroup) {
      return;
    }

    setError(null);
    setNotice(null);
    setIsSavingLink(true);

    try {
      const response = await fetch("/api/integrations/spond/team-link", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          teamId,
          externalTeamId: selectedGroup.id,
          externalTeamName: selectedGroup.name,
        }),
      });

      const payload = (await response.json()) as unknown;

      if (!response.ok) {
        const parsed = parseApiError(payload, unknownError);
        throw new Error(mapErrorMessage(parsed.code, parsed.message));
      }

      setLinkedGroupId(selectedGroup.id);
      setLinkedGroupName(selectedGroup.name);
      setNotice(t("groupLinked"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("errors.generic"));
    } finally {
      setIsSavingLink(false);
    }
  };

  const handleImport = async () => {
    setError(null);
    setNotice(null);
    setIsLoadingImportPreview(true);

    try {
      const response = await fetch(`/api/integrations/spond/import-members/preview?teamId=${encodeURIComponent(teamId)}`, {
        method: "GET",
      });

      const payload = (await response.json()) as unknown;

      if (!response.ok) {
        const parsed = parseApiError(payload, unknownError);
        throw new Error(mapErrorMessage(parsed.code, parsed.message));
      }

      const data = payload as {
        candidates: SpondImportPreviewCandidate[];
      };

      const candidates = data.candidates ?? [];
      setImportPreviewCandidates(candidates);
      setSelectedCandidateExternalIds(
        candidates
          .filter((candidate) => candidate.selectable && candidate.recommendedSelected)
          .map((candidate) => candidate.externalId)
      );

      if (candidates.length === 0) {
        setNotice(t("preview.empty"));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("errors.generic"));
    } finally {
      setIsLoadingImportPreview(false);
    }
  };

  const handleToggleCandidate = (externalId: string) => {
    setSelectedCandidateExternalIds((previous) => {
      if (previous.includes(externalId)) {
        return previous.filter((value) => value !== externalId);
      }

      return [...previous, externalId];
    });
  };

  const handleSelectAllCandidates = () => {
    setSelectedCandidateExternalIds(
      importPreviewCandidates
        .filter((candidate) => candidate.selectable)
        .map((candidate) => candidate.externalId)
    );
  };

  const handleClearAllCandidates = () => {
    setSelectedCandidateExternalIds([]);
  };

  /** Resolves `true` when the import went through (the sheet then closes). */
  const handleConfirmSelectedImport = async (): Promise<boolean> => {
    if (selectedCandidateExternalIds.length === 0) {
      return false;
    }

    setError(null);
    setNotice(null);
    setIsImporting(true);

    try {
      const response = await fetch("/api/integrations/spond/import-members", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          teamId,
          selectedExternalIds: selectedCandidateExternalIds,
        }),
      });

      const payload = (await response.json()) as unknown;

      if (!response.ok) {
        const parsed = parseApiError(payload, unknownError);
        throw new Error(mapErrorMessage(parsed.code, parsed.message));
      }

      const data = payload as {
        created: number;
        reused: number;
        updated: number;
        reactivated: number;
        skipped: number;
        totalSelected: number;
        syncedAt: string;
      };

      await onImported();
      setMembersLastSyncedAt(data.syncedAt ?? new Date().toISOString());
      setImportPreviewCandidates([]);
      setSelectedCandidateExternalIds([]);
      setNotice(
        t("preview.importSummary", {
          created: data.created,
          reused: data.reused,
          updated: data.updated,
          reactivated: data.reactivated,
          skipped: data.skipped,
          total: data.totalSelected,
        })
      );
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("errors.generic"));
      return false;
    } finally {
      setIsImporting(false);
    }
  };

  const handleSyncEvents = async () => {
    setError(null);
    setNotice(null);
    setIsSyncingEvents(true);

    try {
      const response = await fetch("/api/integrations/spond/sync-events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ teamId }),
      });

      const payload = (await response.json()) as unknown;

      if (!response.ok) {
        const parsed = parseApiError(payload, unknownError);
        throw new Error(mapErrorMessage(parsed.code, parsed.message));
      }

      const data = payload as {
        total: number;
        syncedAt: string;
        events: SpondEventOption[];
      };

      setEvents(data.events ?? []);
      setEventsLastSyncedAt(data.syncedAt ?? new Date().toISOString());
      setNotice(
        data.total > 0
          ? t("syncEventsResult", { total: data.total })
          : t("syncEventsNoChanges")
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("errors.generic"));
    } finally {
      setIsSyncingEvents(false);
    }
  };

  const requestResetAction = (action: SpondResetAction) => {
    if (pendingResetAction) return;
    setResetConfirmAction(action);
    setResetConfirmOpen(true);
  };

  const handleResetAction = async (action: SpondResetAction) => {
    if (pendingResetAction) return;
    setError(null);
    setNotice(null);
    setPendingResetAction(action);

    try {
      const response = await fetch("/api/integrations/spond/reset", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          teamId,
          action,
        }),
      });

      const payload = (await response.json()) as unknown;

      if (!response.ok) {
        const parsed = parseApiError(payload, unknownError);
        throw new Error(mapErrorMessage(parsed.code, parsed.message));
      }

      await onImported();
      await loadStatus();

      if (action === "disconnect-and-delete") {
        setEvents([]);
        setLinkedGroupId(null);
        setLinkedGroupName(null);
        setMembersLastSyncedAt(null);
        setEventsLastSyncedAt(null);
        setNotice(t("cleanup.disconnectSuccess"));
      } else {
        setEvents([]);
        setMembersLastSyncedAt(null);
        setEventsLastSyncedAt(null);
        setNotice(t("cleanup.deleteImportedSuccess"));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("errors.generic"));
    } finally {
      setPendingResetAction(null);
    }
  };

  const titleNode = showTitle ? (
    <div className="space-y-1">
      <h3 className="text-base font-semibold text-foreground">{t("title")}</h3>
      <p className="text-sm text-fp-ink-2">{t("subtitle")}</p>
    </div>
  ) : null;

  if (mode !== "cloud") {
    return (
      <div className="space-y-2" data-testid="spond-card">
        {titleNode}
        <p className="text-sm text-fp-ink-2">{t("guestModeHint")}</p>
      </div>
    );
  }

  // ── Presentation state ──────────────────────────────────────────────
  const statusState: "checking" | "connected" | "disconnected" | "unavailable" = connected
    ? "connected"
    : statusCheck?.teamId !== teamId
      ? "checking"
      : statusCheck.ok
        ? "disconnected"
        : "unavailable";
  const linked = connected && !!linkedGroupId;

  const slotForAnchor = (anchor: FeedbackAnchor): FeedbackSlot => {
    if (!connected) return anchor === "status" ? "status" : "connect";
    switch (anchor) {
      case "status":
      case "connect":
        return "status";
      case "groups":
      case "link":
        return "group";
      case "import":
        if (importSheetOpen) return "sheet";
        return linked ? "import" : "group";
      case "events":
        return linked ? "events" : "group";
      case "reset":
        return "danger";
    }
  };
  const activeSlot = slotForAnchor(feedbackAnchor);
  // "Nothing found" answers are information, not a success.
  const neutralNotices = [t("noGroups"), t("preview.empty"), t("syncEventsNoChanges")];

  const feedbackFor = (slot: FeedbackSlot): ReactNode => {
    if (slot !== activeSlot || (!notice && !error)) return null;
    return (
      <div className="space-y-2">
        {notice ? (
          <Notice tone={neutralNotices.includes(notice) ? "info" : "success"} testId="spond-notice">
            {notice}
          </Notice>
        ) : null}
        {error ? (
          <Notice tone="error" testId="spond-error">
            {error}
          </Notice>
        ) : null}
      </div>
    );
  };

  const StatusGlyph =
    statusState === "connected"
      ? CircleCheck
      : statusState === "checking"
        ? LoaderCircle
        : statusState === "unavailable"
          ? CircleAlert
          : CircleDashed;
  const statusWord =
    statusState === "connected"
      ? t("statusConnected")
      : statusState === "checking"
        ? t("statusChecking")
        : statusState === "unavailable"
          ? t("statusUnavailable")
          : t("statusDisconnected");

  const statusDetails = connected
    ? [
        accountLabel ? t("accountValue", { value: accountLabel }) : null,
        linkedGroupName ? t("linkedGroupName", { value: linkedGroupName }) : t("noLinkedGroup"),
        linkedGroupName ? t("lastMembersSync", { value: formatSyncedAt(membersLastSyncedAt) }) : null,
        linkedGroupName ? t("lastEventsSync", { value: formatSyncedAt(eventsLastSyncedAt) }) : null,
      ].filter((line): line is string => line !== null)
    : [];

  const resetCopy = (action: SpondResetAction) => {
    const base = action === "delete-imported-data" ? "deleteImportedConfirmText" : "disconnectConfirmText";
    return spondPlayerCount === undefined
      ? t(`cleanup.${base}NoCount`)
      : t(`cleanup.${base}`, { count: spondPlayerCount });
  };

  return (
    <div className="space-y-6" data-testid="spond-card">
      {/* ── Status ─────────────────────────────────────────────── */}
      <div className="space-y-3">
        {titleNode}
        <div
          role="group"
          aria-label={t("statusGroupLabel")}
          aria-busy={statusState === "checking" || undefined}
          className="rounded-[14px] border border-fp-rule bg-fp-surface px-3.5 py-3"
          data-testid="spond-status"
          data-state={statusState}
        >
          <p role="status" className="flex items-center gap-2 text-base font-semibold text-foreground">
            <StatusGlyph
              size={20}
              strokeWidth={1.75}
              aria-hidden
              className={cn(
                "shrink-0",
                statusState === "connected" && "text-fp-ok-text",
                statusState === "unavailable" && "text-fp-warn-text",
                (statusState === "checking" || statusState === "disconnected") && "text-fp-ink-2"
              )}
            />
            {statusWord}
          </p>
          {statusDetails.length > 0 ? (
            <ul role="list" className="mt-1.5 space-y-0.5 pl-7 text-sm font-medium text-fp-ink-2">
              {statusDetails.map((line) => (
                <li key={line} className="[overflow-wrap:anywhere]">
                  {line}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {feedbackFor("status")}
      </div>

      {/* ── Not connected: sign in to Spond ─────────────────────── */}
      {statusState === "disconnected" ? (
        <form
          onSubmit={(event) => {
            setFeedbackAnchor("connect");
            void handleConnect(event);
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-fp-ink-2" htmlFor="spond-email">
              {t("emailLabel")}
            </label>
            <input
              id="spond-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t("emailPlaceholder")}
              className={cn(teamTextInputClassName, "text-base")}
              autoComplete="username"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-fp-ink-2" htmlFor="spond-password">
              {t("passwordLabel")}
            </label>
            <input
              id="spond-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t("passwordPlaceholder")}
              className={cn(teamTextInputClassName, "text-base")}
              autoComplete="current-password"
            />
          </div>
          {feedbackFor("connect")}
          <Button type="submit" variant="primary" block icon={<Link2 size={18} />} disabled={isConnecting}>
            {isConnecting ? t("loading") : t("connectCta")}
          </Button>
        </form>
      ) : null}

      {/* ── From Spond: what is imported, and import more ───────── */}
      {connected ? (
        <section className="space-y-3" aria-labelledby="spond-from-title">
          <h4 id="spond-from-title" className={SECTION_TITLE}>
            {t("fromSpondTitle")}
          </h4>
          <div className="rounded-[14px] border border-fp-rule bg-fp-surface px-3.5 py-3 text-sm text-foreground">
            <p className="font-semibold" data-testid="spond-summary">
              {spondPlayerCount === undefined ? t("summaryNoCount") : t("summaryCount", { count: spondPlayerCount })}
            </p>
            <p className="mt-1 text-fp-ink-2">{t("summaryReadOnly")}</p>
          </div>
          {linked ? (
            <Button
              variant="primary"
              block
              // aria-disabled, not disabled: focus returns here when the sheet closes.
              aria-disabled={isLoadingImportPreview || isImporting || undefined}
              onClick={() => {
                if (isLoadingImportPreview || isImporting) return;
                setFeedbackAnchor("import");
                setImportSheetOpen(true);
                void handleImport();
              }}
            >
              {t("syncMembersCta")}
            </Button>
          ) : null}
          {feedbackFor("import")}
        </section>
      ) : null}

      {/* ── Spond group ─────────────────────────────────────────── */}
      {connected ? (
        <section className="space-y-3" aria-labelledby="spond-group-title">
          <h4 id="spond-group-title" className={SECTION_TITLE}>
            {t("groupSectionTitle")}
          </h4>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-fp-ink-2" htmlFor="spond-group">
              {t("groupLabel")}
            </label>
            <select
              id="spond-group"
              className={cn(teamTextInputClassName, "text-base")}
              value={selectedGroupId}
              onChange={(event) => setSelectedGroupId(event.target.value)}
              disabled={groups.length === 0}
            >
              {groups.length === 0 ? <option value="">{t("noGroups")}</option> : null}
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name} ({group.memberCount})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={linkedGroupId ? "secondary" : "primary"}
              className="flex-1"
              onClick={() => {
                setFeedbackAnchor("link");
                void handleSaveLink();
              }}
              disabled={!selectedGroupId || isSavingLink}
            >
              {isSavingLink ? t("savingLink") : t("saveLinkCta")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<RefreshCcw size={18} />}
              onClick={() => {
                setFeedbackAnchor("groups");
                void loadGroups().catch((cause) => {
                  setError(cause instanceof Error ? cause.message : t("errors.generic"));
                });
              }}
              disabled={isLoadingGroups}
            >
              {isLoadingGroups ? t("loading") : t("refreshGroups")}
            </Button>
          </div>
          {feedbackFor("group")}
        </section>
      ) : null}

      {/* ── Events ──────────────────────────────────────────────── */}
      {linked ? (
        <section className="space-y-3" aria-labelledby="spond-events-title">
          <div className="flex items-center justify-between gap-2">
            <h4 id="spond-events-title" className={SECTION_TITLE}>
              {t("eventsTitle")}
            </h4>
            <Button
              size="sm"
              variant="ghost"
              icon={<RefreshCcw size={18} />}
              onClick={() => {
                setFeedbackAnchor("events");
                void handleSyncEvents();
              }}
              disabled={isSyncingEvents}
            >
              {isSyncingEvents ? t("syncEventsLoading") : t("syncEventsCta")}
            </Button>
          </div>
          {feedbackFor("events")}
          {events.length === 0 ? (
            <p className="text-sm text-fp-ink-2">{t("eventsEmpty")}</p>
          ) : (
            <ListGroup aria-label={t("eventsTitle")} testId="spond-events">
              {events.map((eventItem) => (
                <ListRow
                  key={eventItem.externalId}
                  label={eventItem.title}
                  description={`${formatEventDate(eventItem.startsAt)}${eventItem.location ? ` · ${eventItem.location}` : ""}`}
                  trailing={
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[13px] font-semibold leading-tight",
                        eventItem.importedMatchId
                          ? "border-fp-spond-border bg-fp-spond-soft text-fp-spond-foreground"
                          : "border-fp-rule bg-fp-surface-2 text-fp-ink-2"
                      )}
                    >
                      {eventItem.importedMatchId ? t("eventImported") : t("eventNotImported")}
                    </span>
                  }
                />
              ))}
            </ListGroup>
          )}
        </section>
      ) : null}

      {/* ── Danger zone: its own group, last ────────────────────── */}
      {connected ? (
        <div className="space-y-3">
          <ListGroup title={t("cleanup.sectionTitle")} titleAs="h4" testId="spond-danger-zone">
            <ListRow
              destructive
              label={pendingResetAction === "delete-imported-data" ? t("cleanup.running") : t("cleanup.deleteImportedCta")}
              description={t("cleanup.deleteImportedHelp")}
              onClick={() => requestResetAction("delete-imported-data")}
              testId="spond-reset-delete"
            />
            <ListRow
              destructive
              label={pendingResetAction === "disconnect-and-delete" ? t("cleanup.running") : t("cleanup.disconnectCta")}
              description={t("cleanup.disconnectHelp")}
              onClick={() => requestResetAction("disconnect-and-delete")}
              testId="spond-reset-disconnect"
            />
          </ListGroup>
          {feedbackFor("danger")}
        </div>
      ) : null}

      <SpondImportSheet
        open={importSheetOpen}
        onOpenChange={setImportSheetOpen}
        candidates={importPreviewCandidates}
        selectedIds={selectedCandidateExternalIds}
        loading={isLoadingImportPreview}
        importing={isImporting}
        onToggle={handleToggleCandidate}
        onSelectAll={handleSelectAllCandidates}
        onClearAll={handleClearAllCandidates}
        onImport={() => {
          setFeedbackAnchor("import");
          void handleConfirmSelectedImport().then((imported) => {
            if (imported) setImportSheetOpen(false);
          });
        }}
        feedback={feedbackFor("sheet")}
      />

      <ConfirmSheet
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        title={
          resetConfirmAction === "delete-imported-data"
            ? t("cleanup.deleteImportedConfirmTitle")
            : t("cleanup.disconnectConfirmTitle")
        }
        description={resetCopy(resetConfirmAction)}
        confirmLabel={
          resetConfirmAction === "delete-imported-data"
            ? t("cleanup.deleteImportedConfirmCta")
            : t("cleanup.disconnectConfirmCta")
        }
        destructive
        onConfirm={() => {
          // Ignore a second press while the sheet slides out.
          if (!resetConfirmOpen) return;
          setResetConfirmOpen(false);
          setFeedbackAnchor("reset");
          void handleResetAction(resetConfirmAction);
        }}
        testId="spond-reset-confirm"
      />
    </div>
  );
}
