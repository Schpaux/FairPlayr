export type IntegrationProvider = "spond";

export interface SpondCredentials {
  email: string;
  password: string;
}

export interface SpondProfile {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

export interface SpondGroupMember {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  profile?: {
    id?: string;
  };
}

export interface SpondGroup {
  id: string;
  name: string;
  members: SpondGroupMember[];
}

export interface SpondEvent {
  id: string;
  heading?: string;
  startTimestamp?: string;
  endTimestamp?: string;
  responses?: {
    acceptedIds?: string[];
    declinedIds?: string[];
    unansweredIds?: string[];
    unconfirmedIds?: string[];
    waitinglistIds?: string[];
  };
  owners?: Array<{
    id: string;
    response?: string;
  }>;
  location?: {
    feature?: string;
    address?: string;
  };
}

export type SpondRsvpStatus =
  | "accepted"
  | "declined"
  | "unanswered"
  | "unconfirmed"
  | "waitinglist";

export interface NormalizedExternalGroup {
  id: string;
  name: string;
  memberCount: number;
}

export interface NormalizedExternalMember {
  externalId: string;
  name: string;
  email: string | null;
}

export interface NormalizedExternalEvent {
  externalId: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  provider: "spond";
}

export interface IntegrationConnectionRow {
  id: string;
  user_id: string;
  provider: IntegrationProvider;
  status: "connected" | "error" | "disconnected";
  account_label: string | null;
  credentials_encrypted: string;
  last_sync_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExternalTeamLinkRow {
  id: string;
  team_id: string;
  provider: IntegrationProvider;
  external_team_id: string;
  external_team_name: string;
  members_last_synced_at: string | null;
  events_last_synced_at: string | null;
  created_by: string;
  created_at: string;
}

export interface NormalizedExternalRsvpEntry {
  externalMemberId: string;
  response: SpondRsvpStatus;
  isOwner: boolean;
}
