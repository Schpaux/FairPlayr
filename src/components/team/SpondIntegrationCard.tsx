"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link2, RefreshCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { AppCard } from "@/components/ui/AppCard";
import { FpButton } from "@/components/ui/FpButton";
import { teamTextInputClassName } from "@/components/team/styles";
import type { TeamStorageMode } from "@/lib/teamData/types";

interface SpondGroupOption {
  id: string;
  name: string;
  memberCount: number;
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
  const [isSyncingEvents, setIsSyncingEvents] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [accountLabel, setAccountLabel] = useState<string | null>(null);
  const [groups, setGroups] = useState<SpondGroupOption[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [linkedGroupId, setLinkedGroupId] = useState<string | null>(null);
  const [membersLastSyncedAt, setMembersLastSyncedAt] = useState<string | null>(null);
  const [eventsLastSyncedAt, setEventsLastSyncedAt] = useState<string | null>(null);

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) ?? null,
    [groups, selectedGroupId]
  );

  const mapErrorMessage = useCallback((code: string, fallback: string) => {
    switch (code) {
      case "UNAUTHORIZED":
        return t("errors.unauthorized");
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
        membersLastSyncedAt: string | null;
        eventsLastSyncedAt: string | null;
      } | null;
    };

    setConnected(data.connected);
    setAccountLabel(data.accountLabel);
    setLinkedGroupId(data.teamLink?.externalTeamId ?? null);
    setMembersLastSyncedAt(data.teamLink?.membersLastSyncedAt ?? null);
    setEventsLastSyncedAt(data.teamLink?.eventsLastSyncedAt ?? null);
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
    setIsImporting(true);

    try {
      const response = await fetch("/api/integrations/spond/import-members", {
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
        created: number;
        updated: number;
        reactivated: number;
        inactivated: number;
        unchanged: number;
        total: number;
        syncedAt: string;
      };

      await onImported();
      setMembersLastSyncedAt(data.syncedAt ?? new Date().toISOString());
      setNotice(
        t("syncMembersResult", {
          created: data.created,
          updated: data.updated,
          reactivated: data.reactivated,
          inactivated: data.inactivated,
          unchanged: data.unchanged,
          total: data.total,
        })
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("errors.generic"));
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
        const parsed = parseApiError(payload);
        throw new Error(mapErrorMessage(parsed.code, parsed.message));
      }

      const data = payload as { total: number; syncedAt: string };
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

  return (
    <AppCard className="space-y-4 p-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground">{t("title")}</h3>
        <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
      </div>

      {mode !== "cloud" ? (
        <p className="text-xs text-muted-foreground">{t("guestModeHint")}</p>
      ) : null}

      {mode === "cloud" ? (
        <>
          <div className="rounded-xl border border-fp-border bg-fp-surface-2 px-3 py-2 text-xs text-muted-foreground">
            {connected ? t("statusConnected") : t("statusDisconnected")}
            {connected && accountLabel ? ` - ${accountLabel}` : ""}
          </div>

          {!connected ? (
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
                {isConnecting ? t("connecting") : t("connectCta")}
              </FpButton>
            </form>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <FpButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="tap-target"
                  onClick={() => {
                    void loadGroups().catch((cause) => {
                      setError(cause instanceof Error ? cause.message : t("errors.generic"));
                    });
                  }}
                  disabled={isLoadingGroups}
                >
                  <RefreshCcw size={14} />
                  {t("refreshGroups")}
                </FpButton>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="spond-group">
                  {t("groupLabel")}
                </label>
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
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <FpButton
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={() => {
                    void handleSaveLink();
                  }}
                  disabled={!selectedGroupId || isSavingLink}
                >
                  {isSavingLink ? t("savingLink") : t("saveLinkCta")}
                </FpButton>
                <FpButton
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={() => {
                    void handleImport();
                  }}
                  disabled={!linkedGroupId || isImporting}
                >
                  {isImporting ? t("syncMembersLoading") : t("syncMembersCta")}
                </FpButton>
                <FpButton
                  type="button"
                  variant="ghost"
                  size="md"
                  onClick={() => {
                    void handleSyncEvents();
                  }}
                  disabled={!linkedGroupId || isSyncingEvents}
                >
                  {isSyncingEvents ? t("syncEventsLoading") : t("syncEventsCta")}
                </FpButton>
              </div>

              {linkedGroupId ? (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t("linkedGroupReady")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("lastMembersSync", { value: formatSyncedAt(membersLastSyncedAt) })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("lastEventsSync", { value: formatSyncedAt(eventsLastSyncedAt) })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("syncMembersInactiveNotice")}
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </>
      ) : null}

      {notice ? <p className="text-xs text-fp-accent">{notice}</p> : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </AppCard>
  );
}
