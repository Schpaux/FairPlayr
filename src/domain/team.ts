export interface Player {
  id: string;
  name: string;
  number?: number;
  preferredPosition?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Team {
  id: string;
  name: string;
  players: Player[];
  createdAt: string;
  updatedAt: string;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function createTeam(name: string): Team {
  const timestamp = nowIso();
  const normalizedName = normalizeWhitespace(name);

  return {
    id: createId(),
    name: normalizedName,
    players: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function renameTeam(team: Team, name: string): Team {
  return {
    ...team,
    name: normalizeWhitespace(name),
    updatedAt: nowIso(),
  };
}

export function createPlayer(name: string): Player {
  const timestamp = nowIso();
  const normalizedName = normalizeWhitespace(name);

  return {
    id: createId(),
    name: normalizedName,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function addPlayer(team: Team, name: string): Team {
  const normalizedName = normalizeWhitespace(name);

  return {
    ...team,
    players: [...team.players, createPlayer(normalizedName)],
    updatedAt: nowIso(),
  };
}

export function renamePlayer(team: Team, playerId: string, name: string): Team {
  const normalizedName = normalizeWhitespace(name);

  return {
    ...team,
    players: team.players.map((player) =>
      player.id === playerId
        ? {
            ...player,
            name: normalizedName,
            updatedAt: nowIso(),
          }
        : player
    ),
    updatedAt: nowIso(),
  };
}

export function deletePlayer(team: Team, playerId: string): Team {
  return {
    ...team,
    players: team.players.filter((player) => player.id !== playerId),
    updatedAt: nowIso(),
  };
}

export function reorderPlayer(team: Team, playerId: string, direction: "up" | "down"): Team {
  const currentIndex = team.players.findIndex((player) => player.id === playerId);

  if (currentIndex < 0) {
    return team;
  }

  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (targetIndex < 0 || targetIndex >= team.players.length) {
    return team;
  }

  const players = [...team.players];
  const [moved] = players.splice(currentIndex, 1);

  players.splice(targetIndex, 0, moved);

  return {
    ...team,
    players,
    updatedAt: nowIso(),
  };
}

export function hasPlayerNameConflict(
  team: Team,
  candidateName: string,
  excludePlayerId?: string
): boolean {
  const normalizedCandidate = normalizeWhitespace(candidateName).toLocaleLowerCase();

  return team.players.some((player) => {
    if (excludePlayerId && player.id === excludePlayerId) {
      return false;
    }

    return player.name.toLocaleLowerCase() === normalizedCandidate;
  });
}
