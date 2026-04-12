"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link2, RefreshCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { AppCard } from "@/components/ui/AppCard";
import { FpButton } from "@/components/ui/FpButton";
import { teamTextInputClassName } from "@/components/team/styles";
import type { TeamStorageMode } from "@/lib/teamData/types";

type SpondResetAction = "delete-imported-data" | "disconnect-and-delete";

interface SpondGroupOption {
  id: string;
  name: string;
  memberCount: number;
}

interface SpondEventOption {
  externalId: string;
  title: string;
  startsAt: string | null;
  location: string | null;
  importedMatchId: string | null;
}

type SpondImportPreviewStatus = "already-imported" | "existing-player" | "new";
type SpondImportClassification = "likely_player" | "likely_staff" | "unknown";

interface SpondImportPreviewCandidate {
  externalId: string;
  name: string;
  email: string | null;
  alreadyImported: boolean;
  existingPlayerId: string | null;
  existingPlayerName: string | null;
  status: SpondImportPreviewStatus;
  importClassification: SpondImportClassification;
  recommendedSelected: boolean;
  selectable: boolean;
}

interface SpondIntegrationCardProps {
  teamId: string;
  mode: TeamStorageMode;
  onImported: () => Promise<void>;
}

function parseApiError(payload: unknown): { code: string; message: string } {
  if (typeof payload !== "object" || payload === null) {
    return { code: "UNKNOWN", message: "Ukjent feil." };
  }

  const value = payload as Record<string, unknown>;

  return {
    code: typeof value.errorCode === "string" ? value.errorCode : "UNKNOWN",
    message: typeof value.message === "string" ? value.message : "Ukjent feil.",
  };
}

export function SpondIntegrationCard({ teamId, mode, onImported }: SpondIntegrationCardProps) {
  const t = useTranslations("team.spond");

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
      const parsed = parseApiError(payload);
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
  }, [mapErrorMessage, teamId]);

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
        const parsed = parseApiError(payload);
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
  }, [linkedGroupId, mapErrorMessage, t]);

  useEffect(() => {
    if (mode !== "cloud") {
      return;
    }

    void (async () => {
      try {
        await loadStatus();
      } catch (cause) {
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
        const parsed = parseApiError(payload);
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
        const parsed = parseApiError(payload);
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
        const parsed = parseApiError(payload);
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

  const handleConfirmSelectedImport = async () => {
    if (selectedCandidateExternalIds.length === 0) {
      return;
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
        const parsed = parseApiError(payload);
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("errors.generic"));
    } finally {
      setIsImporting(false);
    }
  };

  const selectedCount = selectedCandidateExternalIds.length;

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
        const parsed = parseApiError(payload);
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

  const handleResetAction = async (action: SpondResetAction) => {
    const confirmMessage =
      action === "delete-imported-data"
        ? `${t("cleanup.deleteImportedConfirmTitle")}\n\n${t("cleanup.deleteImportedConfirmText")}`
        : `${t("cleanup.disconnectConfirmTitle")}\n\n${t("cleanup.disconnectConfirmText")}`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

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
        const parsed = parseApiError(payload);
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

  if (mode !== "cloud") {
    return (
      <AppCard className="space-y-2 p-4">
        <h3 className="text-base font-semibold text-foreground">{t("title")}</h3>
        <p className="text-xs text-muted-foreground">{t("guestModeHint")}</p>
      </AppCard>
    );
  }

  return (
    <AppCard className="divide-y divide-fp-border overflow-hidden p-0">

      {/* ── Section 1: Status & auth ─────────────────────────────── */}
      <div className="space-y-3 p-4">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold text-foreground">{t("title")}</h3>
          <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
        </div>

        {/* Connection status pill */}
        <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
          connected
            ? "border-fp-spond-border bg-fp-spond-soft"
            : "border-fp-border bg-fp-surface-2"
        }`}>
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-fp-spond" : "bg-muted-foreground/40"}`} />
          <p className="text-xs font-medium text-foreground">
            {connected ? t("statusConnected") : t("statusDisconnected")}
          </p>
          {connected && accountLabel ? (
            <p className="ml-auto text-[11px] text-muted-foreground truncate">{accountLabel}</p>
          ) : null}
        </div>

        {/* Login form — only when disconnected */}
        {!connected && (
          <form onSubmit={handleConnect} className="space-y-2">
            <label className="sr-only" htmlFor="spond-email">{t("emailLabel")}</label>
            <input
              id="spond-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t("emailPlaceholder")}
              className={teamTextInputClassName}
              autoComplete="username"
            />
            <label className="sr-only" htmlFor="spond-password">{t("passwordLabel")}</label>
            <input
              id="spond-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t("passwordPlaceholder")}
              className={teamTextInputClassName}
              autoComplete="current-password"
            />
            <FpButton type="submit" variant="primary" size="md" disabled={isConnecting}>
              <Link2 size={16} />
              {isConnecting ? t("loading") : t("connectCta")}
            </FpButton>
          </form>
        )}
      </div>

      {/* ── Section 2: Group link ─────────────────────────────────── */}
      {connected && (
        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("groupLabel")}
            </p>
            <FpButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                void loadGroups().catch((cause) => {
                  setError(cause instanceof Error ? cause.message : t("errors.generic"));
                });
              }}
              disabled={isLoadingGroups}
            >
              <RefreshCcw size={13} />
              {isLoadingGroups ? t("loading") : t("refreshGroups")}
            </FpButton>
          </div>

          {linkedGroupId && linkedGroupName ? (
            <div className="rounded-xl border border-fp-spond-border bg-fp-spond-soft px-3 py-2">
              <p className="text-xs font-medium text-fp-spond-foreground">
                {t("linkedGroupName", { value: linkedGroupName })}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {t("lastMembersSync", { value: formatSyncedAt(membersLastSyncedAt) })}
                {" · "}
                {t("lastEventsSync", { value: formatSyncedAt(eventsLastSyncedAt) })}
              </p>
            </div>
          ) : null}

          <div className="space-y-2">
            <select
              id="spond-group"
              className={teamTextInputClassName}
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
            <FpButton
              type="button"
              variant="secondary"
              size="md"
              fullWidth
              onClick={() => { void handleSaveLink(); }}
              disabled={!selectedGroupId || isSavingLink}
            >
              {isSavingLink ? t("savingLink") : t("saveLinkCta")}
            </FpButton>
          </div>
        </div>
      )}

      {/* ── Section 3: Import members ─────────────────────────────── */}
      {connected && linkedGroupId && (
        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="space-y-0.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("preview.title")}
              </p>
              <p className="text-[11px] text-muted-foreground">{t("preview.subtitle")}</p>
            </div>
            <FpButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => { void handleImport(); }}
              disabled={isLoadingImportPreview || isImporting}
            >
              {isLoadingImportPreview ? t("preview.loading") : t("syncMembersCta")}
            </FpButton>
          </div>

          {importPreviewCandidates.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <FpButton type="button" variant="ghost" size="sm" onClick={handleSelectAllCandidates} disabled={isImporting}>
                  {t("preview.selectAll")}
                </FpButton>
                <FpButton type="button" variant="ghost" size="sm" onClick={handleClearAllCandidates} disabled={isImporting}>
                  {t("preview.clearAll")}
                </FpButton>
                <p className="text-xs text-muted-foreground">
                  {t("preview.selectedCount", { count: selectedCount })}
                </p>
              </div>

              <ul className="max-h-52 space-y-1.5 overflow-y-auto">
                {importPreviewCandidates.map((candidate) => (
                  <li key={candidate.externalId} className="rounded-lg border border-fp-border bg-background px-3 py-2">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedCandidateExternalIds.includes(candidate.externalId)}
                        onChange={() => handleToggleCandidate(candidate.externalId)}
                        disabled={!candidate.selectable || isImporting}
                        className="mt-0.5 h-4 w-4 rounded border-fp-border"
                      />
                      <span className="min-w-0 space-y-0.5">
                        <span className="block truncate text-sm font-medium text-foreground">{candidate.name}</span>
                        <span className="flex flex-wrap items-center gap-1 text-xs">
                          <span className={
                            candidate.importClassification === "likely_player"
                              ? "rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-300"
                              : candidate.importClassification === "likely_staff"
                                ? "rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-300"
                                : "rounded-full border border-fp-border bg-fp-surface-2 px-2 py-0.5 text-muted-foreground"
                          }>
                            {candidate.importClassification === "likely_player"
                              ? t("preview.classificationPlayer")
                              : candidate.importClassification === "likely_staff"
                                ? t("preview.classificationStaff")
                                : t("preview.classificationUnknown")}
                          </span>
                          <span className="text-muted-foreground">
                            {candidate.status === "already-imported"
                              ? t("preview.statusAlreadyImported")
                              : candidate.status === "existing-player"
                                ? t("preview.statusExisting")
                                : t("preview.statusNew")}
                          </span>
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>

              <FpButton
                type="button"
                variant="primary"
                size="md"
                fullWidth
                onClick={() => { void handleConfirmSelectedImport(); }}
                disabled={selectedCount === 0 || isImporting}
              >
                {isImporting ? t("preview.importing") : t("preview.importSelected")}
              </FpButton>
            </>
          )}
          {importPreviewCandidates.length === 0 && !isLoadingImportPreview && (
            <p className="text-xs text-muted-foreground">{t("preview.helperText")}</p>
          )}
          <p className="text-[11px] text-muted-foreground">{t("syncMembersInactiveNotice")}</p>
        </div>
      )}

      {/* ── Section 4: Events ────────────────────────────────────── */}
      {connected && linkedGroupId && (
        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("eventsTitle")}
            </p>
            <FpButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { void handleSyncEvents(); }}
              disabled={isSyncingEvents}
            >
              <RefreshCcw size={13} />
              {isSyncingEvents ? t("syncEventsLoading") : t("syncEventsCta")}
            </FpButton>
          </div>

          {events.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("eventsEmpty")}</p>
          ) : (
            <ul className="space-y-1.5">
              {events.map((eventItem) => (
                <li key={eventItem.externalId} className="rounded-lg border border-fp-border bg-fp-surface-2 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{eventItem.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatEventDate(eventItem.startsAt)}
                        {eventItem.location ? ` · ${eventItem.location}` : ""}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      eventItem.importedMatchId
                        ? "border-fp-spond-border bg-fp-spond-soft text-fp-spond-foreground"
                        : "border-fp-border bg-background text-muted-foreground"
                    }`}>
                      {eventItem.importedMatchId ? t("eventImported") : t("eventNotImported")}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Section 5: Danger zone ───────────────────────────────── */}
      {connected && (
        <div className="space-y-3 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-danger/70">
            {t("cleanup.sectionTitle")}
          </p>

          <div className="space-y-2">
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-foreground">{t("cleanup.deleteImportedTitle")}</p>
              <p className="text-[11px] text-muted-foreground">{t("cleanup.deleteImportedHelp")}</p>
            </div>
            <FpButton
              type="button"
              variant="danger"
              size="sm"
              onClick={() => { void handleResetAction("delete-imported-data"); }}
              disabled={pendingResetAction !== null}
            >
              {pendingResetAction === "delete-imported-data" ? t("cleanup.running") : t("cleanup.deleteImportedCta")}
            </FpButton>
          </div>

          <div className="h-px bg-fp-border" />

          <div className="space-y-2">
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-foreground">{t("cleanup.disconnectTitle")}</p>
              <p className="text-[11px] text-muted-foreground">{t("cleanup.disconnectHelp")}</p>
            </div>
            <FpButton
              type="button"
              variant="danger"
              size="sm"
              onClick={() => { void handleResetAction("disconnect-and-delete"); }}
              disabled={pendingResetAction !== null}
            >
              {pendingResetAction === "disconnect-and-delete" ? t("cleanup.running") : t("cleanup.disconnectCta")}
            </FpButton>
          </div>
        </div>
      )}

      {/* ── Feedback messages ────────────────────────────────────── */}
      {(notice || error) && (
        <div className="space-y-1 p-4">
          {notice ? <p className="text-xs text-fp-spond-foreground">{notice}</p> : null}
          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </div>
      )}
    </AppCard>
  );
}
