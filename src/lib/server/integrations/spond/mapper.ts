import type {
  NormalizedExternalEvent,
  NormalizedExternalGroup,
  NormalizedExternalMember,
  SpondEvent,
  SpondGroup,
  SpondGroupMember,
  SpondProfile,
} from "@/lib/server/integrations/spond/types";

function sanitizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function displayName(firstName?: string, lastName?: string): string {
  const name = [firstName ?? "", lastName ?? ""].join(" ").trim();
  return name ? sanitizeName(name) : "Ukjent spiller";
}

export function toAccountLabel(profile: SpondProfile): string | null {
  const name = displayName(profile.firstName, profile.lastName);

  if (name !== "Ukjent spiller") {
    return profile.email ? `${name} (${profile.email})` : name;
  }

  return profile.email ?? null;
}

export function toNormalizedGroup(group: SpondGroup): NormalizedExternalGroup {
  return {
    id: group.id,
    name: group.name,
    memberCount: Array.isArray(group.members) ? group.members.length : 0,
  };
}

export function toNormalizedMembers(group: SpondGroup): NormalizedExternalMember[] {
  const members = Array.isArray(group.members) ? group.members : [];

  return members
    .map((member: SpondGroupMember): NormalizedExternalMember | null => {
      const externalId =
        member.id ||
        member.profile?.id ||
        null;

      if (!externalId) {
        return null;
      }

      return {
        externalId,
        name: displayName(member.firstName, member.lastName),
      };
    })
    .filter((member): member is NormalizedExternalMember => member !== null);
}

export function toNormalizedEvent(event: SpondEvent): NormalizedExternalEvent {
  const feature = event.location?.feature?.trim() ?? "";
  const address = event.location?.address?.trim() ?? "";
  const location = [feature, address].filter((value) => value.length > 0).join(", ") || null;

  return {
    externalId: event.id,
    title: event.heading?.trim() || "Spond-arrangement",
    startsAt: event.startTimestamp ?? null,
    endsAt: event.endTimestamp ?? null,
    location,
    provider: "spond",
  };
}
